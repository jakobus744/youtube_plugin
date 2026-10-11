import UIKit
import WebKit

// zeigt YouTube oder YouTube Music in einem WKWebView und startet ytx darin
// der Startlink steht in Info.plist unter YtxStartURL, so entstehen zwei Apps aus demselben Code
final class WebController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private var web: WKWebView!
    private var statusDark = true

    // wie @connect im Userscript
    private let xhrHosts = ["musicbrainz.org", "ws.audioscrobbler.com", "returnyoutubedislikeapi.com", "pi.tail5f332e.ts.net", "100.116.11.12", "192.168.178.56", "jakobpi.duckdns.org"]
    // Seiten die in der App bleiben, alles andere oeffnet im Browser
    private let inAppHosts = ["youtube.com", "google.com", "gstatic.com", "googleusercontent.com", "ytimg.com", "googlevideo.com", "youtube-nocookie.com"]

    // pro Start zufaellig, die Seite kann den Kanal nicht erraten
    private let channel = "ytx" + String(UInt64.random(in: 0...UInt64.max), radix: 36)
    private let recv = "__ytx_" + String(UInt64.random(in: 0...UInt64.max), radix: 36)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let conf = WKWebViewConfiguration()
        conf.allowsInlineMediaPlayback = true
        conf.mediaTypesRequiringUserActionForPlayback = []
        conf.allowsPictureInPictureMediaPlayback = true
        // Google verweigert die Anmeldung in eingebetteten Ansichten, mit Safari Kennung geht sie
        conf.applicationNameForUserAgent = "Version/17.0 Mobile/15E148 Safari/604.1"
        conf.userContentController.add(self, name: channel)
        addScripts(to: conf.userContentController)

        web = WKWebView(frame: .zero, configuration: conf)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        if #available(iOS 16.4, *) { web.isInspectable = true }
        view.addSubview(web)
        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: g.topAnchor),
            web.bottomAnchor.constraint(equalTo: g.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        let s = (Bundle.main.object(forInfoDictionaryKey: "YtxStartURL") as? String) ?? "https://m.youtube.com/"
        web.load(URLRequest(url: URL(string: s)!))
        CodeUpdater.checkIfDue()
    }

    private func resource(_ name: String) -> String? {
        guard let u = Bundle.main.url(forResource: name, withExtension: "js") else { return nil }
        return try? String(contentsOf: u, encoding: .utf8)
    }

    private func addScripts(to ucc: WKUserContentController) {
        if let shim = resource("shim"), let cur = CodeUpdater.current() {
            let q = { (s: String) -> String in
                String(data: try! JSONSerialization.data(withJSONObject: [s]), encoding: .utf8)!.dropFirst().dropLast().description
            }
            // auf Google Seiten (Anmeldung) laeuft ytx nicht, dort gibt es keine GM Funktionen
            let src = "if (/(^|\\.)youtube\\.com$/.test(location.hostname)) {\n(\(shim))(\(q(channel)), \(q(recv)), \(Store.objectLiteral()), \(q(cur.version)));\n\(cur.code)\n}\n//# sourceURL=ytx.user.js"
            // WKUserScript wird von der Seiten CSP nicht blockiert, deshalb braucht es hier keinen Eingriff in die Header
            ucc.addUserScript(WKUserScript(source: src, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if let embed = resource("embed") {
            ucc.addUserScript(WKUserScript(source: embed, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
    }

    // MARK: Nachrichten der Seite

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        // nur die Hauptseite von YouTube darf die App ansprechen
        guard m.frameInfo.isMainFrame, isYouTube(m.frameInfo.securityOrigin.host),
              let s = m.body as? String, let d = s.data(using: .utf8),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let t = o["t"] as? String else { return }
        switch t {
        case "set":
            if let k = o["k"] as? String, let v = o["v"] as? String { Store.set(k, json: v) }
        case "del":
            if let k = o["k"] as? String { Store.remove(k) }
        case "clip":
            if let text = o["text"] as? String { UIPasteboard.general.string = String(text.prefix(4_000_000)) }
        case "theme":
            if let bg = o["bg"] as? String { applyTheme(bg) }
        case "log":
            print("[ytx-page]", o["text"] as? String ?? "")
        case "xhr":
            runXhr(o)
        default:
            // "app" Befehle (Mini Player, Vollbild) gibt es auf iOS nicht
            break
        }
    }

    private func applyTheme(_ css: String) {
        let n = css.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).joined(separator: " ")
            .split(separator: " ").compactMap { Double($0) }
        guard n.count >= 3 else { return }
        view.backgroundColor = UIColor(red: n[0] / 255, green: n[1] / 255, blue: n[2] / 255, alpha: 1)
        statusDark = (0.299 * n[0] + 0.587 * n[1] + 0.114 * n[2]) < 140
        setNeedsStatusBarAppearanceUpdate()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { statusDark ? .lightContent : .darkContent }

    // gm_xmlhttpRequest ueber die App, damit CORS egal ist
    private func runXhr(_ m: [String: Any]) {
        guard let id = m["id"] as? Int, let urlStr = m["url"] as? String, let url = URL(string: urlStr) else { return }
        let host = url.host ?? ""
        guard xhrHosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) else {
            return reply(["t": "xhr", "id": id, "error": "host nicht erlaubt: \(host)"])
        }
        var req = URLRequest(url: url)
        req.httpMethod = (m["method"] as? String) ?? "GET"
        for (k, v) in (m["headers"] as? [String: String]) ?? [:] { req.setValue(v, forHTTPHeaderField: k) }
        if let data = m["data"] as? String { req.httpBody = data.data(using: .utf8) }
        if let ms = m["timeout"] as? Double, ms > 0 { req.timeoutInterval = ms / 1000 }
        URLSession.shared.dataTask(with: req) { [weak self] data, resp, err in
            if let e = err as? URLError, e.code == .timedOut { return self?.reply(["t": "xhr", "id": id, "timeout": true]) ?? () }
            if let err { return self?.reply(["t": "xhr", "id": id, "error": err.localizedDescription]) ?? () }
            let h = resp as? HTTPURLResponse
            let headers = (h?.allHeaderFields ?? [:]).map { "\($0.key): \($0.value)" }.joined(separator: "\r\n")
            self?.reply([
                "t": "xhr", "id": id, "status": h?.statusCode ?? 0,
                "statusText": HTTPURLResponse.localizedString(forStatusCode: h?.statusCode ?? 0),
                "responseText": String(data: data ?? Data(), encoding: .utf8) ?? "",
                "finalUrl": resp?.url?.absoluteString ?? urlStr, "responseHeaders": headers,
            ])
        }.resume()
    }

    private func reply(_ obj: [String: Any]) {
        guard let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) else { return }
        DispatchQueue.main.async { self.web.evaluateJavaScript("window['\(self.recv)'](\(s))") }
    }

    // MARK: Navigation

    private func hostMatches(_ host: String, _ list: [String]) -> Bool {
        list.contains(where: { host == $0 || host.hasSuffix("." + $0) })
    }

    private func isYouTube(_ host: String) -> Bool { hostMatches(host, ["youtube.com"]) }

    // gilt fuer jede Navigation der Hauptseite, nicht nur fuer Links
    private func allowedInApp(_ url: URL) -> Bool {
        if url.scheme == "about" { return true }
        return url.scheme == "https" && hostMatches(url.host ?? "", inAppHosts)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard action.targetFrame?.isMainFrame ?? true, let url = action.request.url else {
            return decisionHandler(.allow)
        }
        if allowedInApp(url) { return decisionHandler(.allow) }
        if action.navigationType == .linkActivated, url.scheme == "https" { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    // window.open und target=_blank bleiben im selben Fenster
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = action.request.url {
            if allowedInApp(u) { webView.load(URLRequest(url: u)) } else if u.scheme == "https" { UIApplication.shared.open(u) }
        }
        return nil
    }

    // Absturz des Web Prozesses (iOS beendet ihn bei wenig Speicher): neu laden
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}
