// Andy Apples als iOS-app: een schermvullende WKWebView die het spel (game/index.html in de app) laadt.
// Een kleine JavaScript-brug regelt wat een WebView zelf niet kan: tekst naar het klembord kopiëren, en de instellingen
// Scherm (volledig scherm, altijd liggend). De brug heet in JavaScript ook window.AndroidBridge, met dezelfde functies
// als in de Android-app, zodat het spel zelf niets hoeft te weten van iOS (IN_APP en appScreen() in js/view.js).
import UIKit
import WebKit

// De knop Bijwerken in het spel wijst naar de Android-APK (CONFIG.apkUrl); op iOS openen we dan deze pagina
let IOS_URL = "https://github.com/Stoin3/andy-apple/tree/main/ios"

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ app: UIApplication, didFinishLaunchingWithOptions opts: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = GameController()
        w.makeKeyAndVisible()
        window = w
        app.isIdleTimerDisabled = true // scherm niet op slot tijdens het spelen
        return true
    }
}

final class GameController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UIScrollViewDelegate {
    private var web: WKWebView!
    private let prefs = UserDefaults.standard
    private var full: Bool { prefs.object(forKey: "full") as? Bool ?? true }
    private var land: Bool { prefs.object(forKey: "land") as? Bool ?? true }

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        // "AndyApplesApp" maakt IN_APP waar in het spel; "Mobile/…" hoort bij de normale iOS-useragent
        cfg.applicationNameForUserAgent = "Mobile/15E148 AndyApplesApp/1.0"
        cfg.userContentController.add(self, name: "andy")
        web = WKWebView(frame: .zero, configuration: cfg)
        let bg = UIColor(red: 13 / 255, green: 42 / 255, blue: 26 / 255, alpha: 1)
        web.isOpaque = false
        web.backgroundColor = bg
        web.scrollView.backgroundColor = bg
        // het spel vult het hele scherm (ook achter de notch); de veilige randen regelt de CSS met env(safe-area-inset-*)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.delegate = self
        web.navigationDelegate = self
        web.uiDelegate = self
        if #available(iOS 16.4, *) { web.isInspectable = true } // debuggen via Safari op een Mac
        installBridge()
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let dir = Bundle.main.resourceURL?.appendingPathComponent("game") else { return }
        web.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
    }

    // Inzoomen met twee vingers uit (iOS negeert user-scalable=no in de viewport)
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }

    // ---------------------------------------------------------------------------------------------
    //  JavaScript-brug (window.AndroidBridge)
    // ---------------------------------------------------------------------------------------------

    /// isFullscreen()/isLandscape() moeten direct een antwoord geven: de huidige stand zit daarom in het script zelf.
    /// Na elke wijziging zetten we het script opnieuw, zodat het ook na herladen klopt.
    private func installBridge() {
        let js = """
        (function () {
          var s = { full: \(full), land: \(land) };
          function post(m) { window.webkit.messageHandlers.andy.postMessage(m); }
          window.AndroidBridge = {
            copy: function (t) { post({ copy: String(t) }); },
            setFullscreen: function (on) { s.full = !!on; post({ full: s.full }); },
            isFullscreen: function () { return s.full; },
            setLandscape: function (on) { s.land = !!on; post({ land: s.land }); },
            isLandscape: function () { return s.land; }
          };
        })();
        """
        let c = web?.configuration.userContentController
        c?.removeAllUserScripts()
        c?.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    func userContentController(_ c: WKUserContentController, didReceive msg: WKScriptMessage) {
        guard let d = msg.body as? [String: Any] else { return }
        if let t = d["copy"] as? String { UIPasteboard.general.string = t }
        if let on = d["full"] as? Bool {
            prefs.set(on, forKey: "full")
            setNeedsStatusBarAppearanceUpdate()
            setNeedsUpdateOfHomeIndicatorAutoHidden()
            setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
            installBridge()
        }
        if let on = d["land"] as? Bool {
            prefs.set(on, forKey: "land")
            applyOrientation()
            installBridge()
        }
    }

    // ---------------------------------------------------------------------------------------------
    //  Scherm: volledig scherm en liggend
    // ---------------------------------------------------------------------------------------------

    // Volledig scherm (standaard): statusbalk en thuisbalk weg, en vegen langs de rand gaat eerst naar het spel
    override var prefersStatusBarHidden: Bool { full }
    override var prefersHomeIndicatorAutoHidden: Bool { full }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { full ? .all : [] }

    // Altijd liggend (standaard), of meedraaien met de telefoon
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { land ? .landscape : .allButUpsideDown }

    private func applyOrientation() {
        if #available(iOS 16.0, *) {
            setNeedsUpdateOfSupportedInterfaceOrientations()
            if land { view.window?.windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: .landscape)) { _ in } }
        } else {
            UIViewController.attemptRotationToDeviceOrientation()
        }
    }

    // ---------------------------------------------------------------------------------------------
    //  Navigatie
    // ---------------------------------------------------------------------------------------------

    /// Het spel zelf (file://) blijft in de app; andere links gaan naar Safari.
    func webView(_ w: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == "file" || scheme == "about" || scheme == "blob" || scheme == "data" || action.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
            return
        }
        openOutside(url)
        decisionHandler(.cancel)
    }

    /// target="_blank" en window.open: ook naar Safari
    func webView(_ w: WKWebView, createWebViewWith cfg: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { openOutside(url) }
        return nil
    }

    private func openOutside(_ url: URL) {
        let target = url.pathExtension.lowercased() == "apk" ? URL(string: IOS_URL)! : url
        UIApplication.shared.open(target)
    }

    /// Het tekenproces van de WebView is gestopt (bijv. door iOS opgeruimd): opnieuw laden in plaats van een leeg scherm.
    /// Je voortgang staat in localStorage en blijft bewaard.
    func webViewWebContentProcessDidTerminate(_ w: WKWebView) {
        w.reload()
    }
}
