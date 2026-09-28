#!/usr/bin/env python3
"""
Bouwt Andy Apples als Android-app (.apk) zonder Android Studio of de Android SDK.

Een APK is een zip met daarin:
  AndroidManifest.xml  (in Androids binaire XML-formaat)  -> hier zelf geschreven
  resources.arsc       (resourcetabel, alleen voor het icoon) -> hier zelf geschreven
  classes.dex          (de Java-code van MainActivity)
  res/.../icon.png     (het app-icoon)
  assets/...           (het spel zelf: index.html, css/ en js/)
en wordt daarna ondertekend (APK-handtekening v2) met apksig. Werkt vanaf Android 7.0.

Benodigd (alles van Maven Central, zie README in deze map):
  tools/android-all.jar  org.robolectric:android-all (Android-classes om tegen te compileren)
  tools/dx.jar           com.jakewharton.android.repackaged:dalvik-dx (Java -> dex)
  tools/apksig.jar       com.android.tools.build:apksig (ondertekenen)
en een JDK (javac, java, keytool).

Gebruik:  python3 build_apk.py --tools DIR --keystore andy.p12 --storepass WACHTWOORD [--version 1.0 --code 1]
"""
import argparse, os, shutil, struct, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PACKAGE = 'nl.andyapples.game'
ANDROID_NS = 'http://schemas.android.com/apk/res/android'

# Resource-ID's van de Android-attributen en -thema's die we gebruiken
A = {'theme': 0x01010000, 'label': 0x01010001, 'icon': 0x01010002, 'name': 0x01010003, 'exported': 0x01010010,
     'screenOrientation': 0x0101001e, 'configChanges': 0x0101001f, 'minSdkVersion': 0x0101020c,
     'versionCode': 0x0101021b, 'versionName': 0x0101021c, 'targetSdkVersion': 0x01010270,
     'allowBackup': 0x01010280, 'hardwareAccelerated': 0x010102d3}
THEME_FULLSCREEN = 0x0103000a     # @android:style/Theme.Black.NoTitleBar.Fullscreen
ICON_ID = 0x7f010000              # @drawable/icon (in onze eigen resources.arsc)
T_REF, T_STRING, T_DEC, T_HEX, T_BOOL = 0x01, 0x03, 0x10, 0x11, 0x12


# ---------------------------------------------------------------------------------------------
#  Binaire XML (AXML) en resourcetabel (ARSC)
# ---------------------------------------------------------------------------------------------
def string_pool(strings):
    """ResStringPool in UTF-16."""
    offs, data = [], b''
    for s in strings:
        offs.append(len(data))
        u = s.encode('utf-16-le')
        data += struct.pack('<H', len(s)) + u + b'\0\0'
    while len(data) % 4:
        data += b'\0'
    header_size = 28
    strings_start = header_size + 4 * len(strings)
    body = b''.join(struct.pack('<I', o) for o in offs) + data
    return struct.pack('<HHIIIIII', 0x0001, header_size, header_size + len(body), len(strings), 0, 0, strings_start, 0) + body


def res_value(dtype, data):
    return struct.pack('<HBBI', 8, 0, dtype, data & 0xFFFFFFFF)


class Elem:
    def __init__(self, tag, attrs=(), children=()):
        self.tag, self.attrs, self.children = tag, list(attrs), list(children)


def axml(root):
    """root: Elem. attrs: (naam, type, waarde); naam zonder ID (zoals 'package') staat buiten de android-namespace."""
    # 1) strings: eerst alle attribuutnamen MET resource-ID (in ID-volgorde, voor de resource map), dan de rest
    id_names = sorted({a[0] for e in walk(root) for a in e.attrs if a[0] in A}, key=lambda n: A[n])
    strings = list(id_names)
    def sid(s):
        if s not in strings:
            strings.append(s)
        return strings.index(s)
    sid('android'); sid(ANDROID_NS)
    for e in walk(root):
        sid(e.tag)
        for n, t, v in e.attrs:
            sid(n)
            if t == T_STRING:
                sid(v)

    chunks = []
    ns_start = struct.pack('<HHIIIII', 0x0100, 16, 24, 1, 0xFFFFFFFF, sid('android'), sid(ANDROID_NS))

    def emit(e):
        # attributen met ID oplopend gesorteerd (dat verwacht Android), daarna die zonder ID
        attrs = sorted([a for a in e.attrs if a[0] in A], key=lambda a: A[a[0]]) + [a for a in e.attrs if a[0] not in A]
        body = b''
        for n, t, v in attrs:
            ns = sid(ANDROID_NS) if n in A else 0xFFFFFFFF
            if t == T_STRING:
                raw, data = sid(v), sid(v)
            else:
                raw, data = 0xFFFFFFFF, (0xFFFFFFFF if (t == T_BOOL and v) else (0 if t == T_BOOL else v))
            body += struct.pack('<III', ns, sid(n), raw) + res_value(t, data)
        ext = struct.pack('<IIHHHHHH', 0xFFFFFFFF, sid(e.tag), 20, 20, len(attrs), 0, 0, 0)
        start = struct.pack('<HHIII', 0x0102, 16, 16 + len(ext) + len(body), 1, 0xFFFFFFFF) + ext + body
        chunks.append(start)
        for c in e.children:
            emit(c)
        chunks.append(struct.pack('<HHIIIII', 0x0103, 16, 24, 1, 0xFFFFFFFF, 0xFFFFFFFF, sid(e.tag)))

    emit(root)
    ns_end = struct.pack('<HHIIIII', 0x0101, 16, 24, 1, 0xFFFFFFFF, sid('android'), sid(ANDROID_NS))
    pool = string_pool(strings)
    resmap = struct.pack('<HHI', 0x0180, 8, 8 + 4 * len(id_names)) + b''.join(struct.pack('<I', A[n]) for n in id_names)
    body = pool + resmap + ns_start + b''.join(chunks) + ns_end
    return struct.pack('<HHI', 0x0003, 8, 8 + len(body)) + body


def walk(e):
    yield e
    for c in e.children:
        yield from walk(c)


def arsc(icon_path):
    """Minimale resourcetabel met één resource: drawable/icon (0x7f010000), dichtheid xxxhdpi."""
    global_pool = string_pool([icon_path])
    type_pool = string_pool(['drawable'])
    key_pool = string_pool(['icon'])
    # typeSpec: 1 entry, varieert op dichtheid
    type_spec = struct.pack('<HHIBBHI', 0x0202, 16, 20, 1, 0, 0, 1) + struct.pack('<I', 0x0100)
    # type: config van 64 bytes (size=64, density=640 op offset 14, sdkVersion=4 op offset 24)
    config = bytearray(64)
    struct.pack_into('<I', config, 0, 64)
    struct.pack_into('<H', config, 14, 640)
    struct.pack_into('<H', config, 24, 4)
    header_size = 20 + 64
    entry = struct.pack('<HHI', 8, 0, 0) + res_value(T_STRING, 0)
    type_chunk = struct.pack('<HHIBBHII', 0x0201, header_size, header_size + 4 + len(entry), 1, 0, 0, 1, header_size + 4) \
        + bytes(config) + struct.pack('<I', 0) + entry
    name = PACKAGE.encode('utf-16-le').ljust(256, b'\0')
    pkg_header_size = 288
    type_off = pkg_header_size
    key_off = type_off + len(type_pool)
    pkg_body = type_pool + key_pool + type_spec + type_chunk
    package = struct.pack('<HHII', 0x0200, pkg_header_size, pkg_header_size + len(pkg_body), 0x7f) + name \
        + struct.pack('<IIIII', type_off, 1, key_off, 1, 0) + pkg_body
    body = global_pool + package
    return struct.pack('<HHII', 0x0002, 12, 12 + len(body), 1) + body


def manifest(version_name, version_code):
    E = Elem
    return axml(E('manifest', [('versionCode', T_DEC, version_code), ('versionName', T_STRING, version_name), ('package', T_STRING, PACKAGE)], [
        E('uses-sdk', [('minSdkVersion', T_DEC, 24), ('targetSdkVersion', T_DEC, 34)]),
        E('uses-permission', [('name', T_STRING, 'android.permission.INTERNET')]),   # voor online multiplayer
        E('application', [('theme', T_REF, THEME_FULLSCREEN), ('label', T_STRING, 'Andy Apples'), ('icon', T_REF, ICON_ID),
                          ('allowBackup', T_BOOL, True), ('hardwareAccelerated', T_BOOL, True)], [
            E('activity', [('name', T_STRING, PACKAGE + '.MainActivity'), ('exported', T_BOOL, True),
                           ('screenOrientation', T_DEC, 6),       # sensorLandscape: altijd liggend
                           ('configChanges', T_HEX, 0x3ff0)], [  # niet herstarten bij draaien/formaatwissel
                E('intent-filter', [], [
                    E('action', [('name', T_STRING, 'android.intent.action.MAIN')]),
                    E('category', [('name', T_STRING, 'android.intent.category.LAUNCHER')]),
                ]),
            ]),
        ]),
    ]))


# ---------------------------------------------------------------------------------------------
#  Bouwen
# ---------------------------------------------------------------------------------------------
def run(cmd):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    out = '\n'.join(l for l in r.stdout.splitlines() if 'JAVA_TOOL_OPTIONS' not in l and not l.startswith('warning:') and 'bootstrap class path' not in l)
    if r.returncode:
        sys.exit(f'Mislukt: {" ".join(cmd)}\n{out}')
    return out


def write_aligned_zip(path, entries):
    """entries: (naam, bytes, opgeslagen_zonder_compressie). Ongecomprimeerde bestanden worden op 4 bytes uitgelijnd."""
    with zipfile.ZipFile(path, 'w') as z:
        for name, data, stored in entries:
            zi = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            zi.create_system = 0
            if stored:
                zi.compress_type = zipfile.ZIP_STORED
                offset = z.fp.tell() + 30 + len(name.encode())
                zi.extra = b'\0' * ((4 - offset % 4) % 4)
            else:
                zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, data)


GAME_DIRS = ('css', 'js')   # mappen naast index.html die bij het spel horen


def game_assets():
    """(naam in de APK, bytes) voor index.html en alles in GAME_DIRS, in vaste volgorde."""
    out = [('assets/index.html', open(os.path.join(ROOT, 'index.html'), 'rb').read())]
    for d in GAME_DIRS:
        for base, dirs, files in sorted(os.walk(os.path.join(ROOT, d))):
            dirs.sort()
            for f in sorted(files):
                path = os.path.join(base, f)
                out.append(('assets/' + os.path.relpath(path, ROOT).replace(os.sep, '/'), open(path, 'rb').read()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tools', required=True)
    ap.add_argument('--keystore', required=True)
    ap.add_argument('--storepass', required=True)
    ap.add_argument('--alias', default='andy')
    ap.add_argument('--version', default='1.0')
    ap.add_argument('--code', type=int, default=1)
    ap.add_argument('--out', default=os.path.join(HERE, 'AndyApples.apk'))
    a = ap.parse_args()
    tools = os.path.abspath(a.tools)
    work = tempfile.mkdtemp(prefix='andyapk-')
    try:
        # 1) Java -> class -> dex
        classes = os.path.join(work, 'classes')
        os.makedirs(classes)
        src = os.path.join(HERE, 'src', *PACKAGE.split('.'), 'MainActivity.java')
        run(['javac', '-nowarn', '--release', '8', '-encoding', 'UTF-8', '-cp', os.path.join(tools, 'android-all.jar'), '-d', classes, src])
        dex = os.path.join(work, 'classes.dex')
        run(['java', '-cp', os.path.join(tools, 'dx.jar'), 'com.android.dx.command.Main', '--dex', '--min-sdk-version=24', '--output=' + dex, classes])
        # 2) zip samenstellen
        icon_path = 'res/drawable-xxxhdpi-v4/icon.png'
        unsigned = os.path.join(work, 'unsigned.apk')
        write_aligned_zip(unsigned, [
            ('AndroidManifest.xml', manifest(a.version, a.code), False),
            ('classes.dex', open(dex, 'rb').read(), False),
            ('resources.arsc', arsc(icon_path), True),
            (icon_path, open(os.path.join(HERE, 'icon.png'), 'rb').read(), True),
        ] + [(name, data, False) for name, data in game_assets()])
        # 3) ondertekenen (v2) met apksig
        signer_dir = os.path.join(work, 'signer')
        os.makedirs(signer_dir)
        run(['javac', '-nowarn', '-cp', os.path.join(tools, 'apksig.jar'), '-d', signer_dir, os.path.join(HERE, 'Sign.java')])
        # deze apksig-versie gebruikt interne JDK-klassen: die zetten we open voor nieuwere Java-versies
        opens = [f for m in ('sun.security.x509', 'sun.security.pkcs', 'sun.security.util') for f in ('--add-exports', 'java.base/' + m + '=ALL-UNNAMED')]
        run(['java', *opens, '-cp', signer_dir + os.pathsep + os.path.join(tools, 'apksig.jar'), 'Sign',
             os.path.abspath(a.keystore), a.storepass, a.alias, unsigned, os.path.abspath(a.out)])
        print('Klaar:', a.out, os.path.getsize(a.out) // 1024, 'KB')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
