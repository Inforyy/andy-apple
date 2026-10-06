#!/usr/bin/env python3
"""
Bouwt Andy Apples als iOS-app (.ipa) zonder Xcode-project. Draait op macOS met Xcode (of de Command Line Tools
met de iOS-SDK); wie geen Mac heeft, laat de GitHub-workflow .github/workflows/ios.yml het doen.

Een .ipa is een zip met daarin Payload/AndyApples.app/:
  AndyApples        het programma (AndyApples.swift, gecompileerd met swiftc voor arm64)
  Info.plist        naam, versie, schermstanden, icoon -> hier zelf geschreven
  AppIcon*.png      het app-icoon (uit ../android/icon.png, met sips op maat gemaakt)
  game/...          het spel zelf: index.html, css/ en js/ (dezelfde bestanden als in de APK)

Standaard is de .ipa NIET ondertekend: dat doe je zelf, bijv. met Sideloadly of AltStore en je eigen Apple ID
(zie README in deze map). Met --sign (en --profile) ondertekent dit script hem meteen met je eigen certificaat.

Gebruik:  python3 build_ipa.py [--version 1.0 --build 1] [--sign "Apple Development: …" --profile app.mobileprovision]
"""
import argparse, os, plistlib, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.dont_write_bytecode = True  # geen __pycache__ in android/
sys.path.insert(0, os.path.join(ROOT, 'android'))
from build_apk import game_assets  # noqa: E402  dezelfde spelbestanden (GAME_DIRS, zonder ?v=) als de APK

BUNDLE_ID = 'nl.andyapples.game'
EXE = 'AndyApples'
MIN_IOS = '14.0'
# (bestandsnaam in de app, pixels)
ICONS = (('AppIcon60x60@2x.png', 120), ('AppIcon60x60@3x.png', 180),
         ('AppIcon76x76@2x~ipad.png', 152), ('AppIcon83.5x83.5@2x~ipad.png', 167))
ORIENT = ['UIInterfaceOrientationLandscapeRight', 'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationPortrait']


def run(cmd):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if r.returncode:
        sys.exit(f'Mislukt: {" ".join(cmd)}\n{r.stdout}')
    return r.stdout


def info_plist(version, build):
    return {
        'CFBundleDevelopmentRegion': 'nl',
        'CFBundleDisplayName': 'Andy Apples',
        'CFBundleName': 'Andy Apples',
        'CFBundleExecutable': EXE,
        'CFBundleIdentifier': BUNDLE_ID,
        'CFBundleInfoDictionaryVersion': '6.0',
        'CFBundlePackageType': 'APPL',
        'CFBundleShortVersionString': version,
        'CFBundleVersion': str(build),
        'CFBundleSupportedPlatforms': ['iPhoneOS'],
        'DTPlatformName': 'iphoneos',
        'LSRequiresIPhoneOS': True,
        'MinimumOSVersion': MIN_IOS,
        'UIDeviceFamily': [1, 2],                       # iPhone en iPad
        'UIRequiredDeviceCapabilities': ['arm64'],
        'UILaunchScreen': {},                           # schermvullend (zonder dit draait de app in een kleine iPhone-5-stand)
        'UIRequiresFullScreen': True,                   # iPad: geen Split View, zodat de app zelf de schermstand kiest
        'UIStatusBarHidden': True,
        'UIViewControllerBasedStatusBarAppearance': True,
        'UISupportedInterfaceOrientations': ORIENT,
        'UISupportedInterfaceOrientations~ipad': ORIENT + ['UIInterfaceOrientationPortraitUpsideDown'],
        'CADisableMinimumFrameDurationOnPhone': True,   # ProMotion: meer dan 60 Hz toestaan
        'CFBundleIcons': {'CFBundlePrimaryIcon': {'CFBundleIconFiles': ['AppIcon60x60']}},
        'CFBundleIcons~ipad': {'CFBundlePrimaryIcon': {'CFBundleIconFiles': ['AppIcon60x60', 'AppIcon76x76', 'AppIcon83.5x83.5']}},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', default='1.0')
    ap.add_argument('--build', type=int, default=1)
    ap.add_argument('--sign', help='naam van je ondertekeningscertificaat in de sleutelhanger (optioneel)')
    ap.add_argument('--profile', help='.mobileprovision die bij --sign hoort (optioneel)')
    ap.add_argument('--out', default=os.path.join(HERE, 'AndyApples.ipa'))
    a = ap.parse_args()
    if sys.platform != 'darwin':
        sys.exit('Een iOS-app bouwen kan alleen op macOS. Zonder Mac: start de workflow "iOS-app bouwen" op GitHub (zie README).')
    work = tempfile.mkdtemp(prefix='andyipa-')
    try:
        app = os.path.join(work, 'Payload', EXE + '.app')
        os.makedirs(app)
        # 1) Swift -> arm64-programma
        sdk = run(['xcrun', '--sdk', 'iphoneos', '--show-sdk-path']).strip()
        run(['xcrun', '--sdk', 'iphoneos', 'swiftc', '-O', '-parse-as-library', '-sdk', sdk,
             '-target', f'arm64-apple-ios{MIN_IOS}', '-o', os.path.join(app, EXE), os.path.join(HERE, 'AndyApples.swift')])
        # 2) Info.plist en icoon
        with open(os.path.join(app, 'Info.plist'), 'wb') as f:
            plistlib.dump(info_plist(a.version, a.build), f, fmt=plistlib.FMT_BINARY)
        for name, px in ICONS:
            run(['sips', '-z', str(px), str(px), os.path.join(ROOT, 'android', 'icon.png'), '--out', os.path.join(app, name)])
        # 3) het spel
        for name, data in game_assets():
            path = os.path.join(app, 'game', *name[len('assets/'):].split('/'))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f:
                f.write(data)
        # 4) eventueel ondertekenen
        if a.sign:
            cmd = ['codesign', '--force', '--sign', a.sign, '--timestamp=none']
            if a.profile:
                shutil.copy(a.profile, os.path.join(app, 'embedded.mobileprovision'))
                prof = plistlib.loads(run(['security', 'cms', '-D', '-i', a.profile]).encode())
                ent = os.path.join(work, 'entitlements.plist')
                with open(ent, 'wb') as f:
                    plistlib.dump(prof['Entitlements'], f)
                cmd += ['--entitlements', ent]
            run(cmd + [app])
        # 5) .ipa (ditto houdt rechten en handtekening intact)
        if os.path.exists(a.out):
            os.remove(a.out)
        run(['ditto', '-c', '-k', '--keepParent', os.path.join(work, 'Payload'), os.path.abspath(a.out)])
        print('Klaar:', a.out, os.path.getsize(a.out) // 1024, 'KB', '(ondertekend)' if a.sign else '(niet ondertekend)')
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == '__main__':
    main()
