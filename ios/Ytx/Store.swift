import Foundation

// gespeicherte Werte der GM Funktionen, jeder Wert liegt als JSON Text unter "gm:Name"
enum Store {
    private static let d = UserDefaults.standard

    static func set(_ key: String, json: String) { d.set(json, forKey: "gm:" + key) }
    static func remove(_ key: String) { d.removeObject(forKey: "gm:" + key) }

    // als Objekt Text fuer die Seite, kaputte Werte werden uebersprungen
    static func objectLiteral() -> String {
        var parts: [String] = []
        for (k, v) in d.dictionaryRepresentation() where k.hasPrefix("gm:") {
            guard let s = v as? String, let data = s.data(using: .utf8),
                  (try? JSONSerialization.jsonObject(with: data, options: .fragmentsAllowed)) != nil,
                  let name = try? JSONSerialization.data(withJSONObject: [String(k.dropFirst(3))]),
                  var key = String(data: name, encoding: .utf8) else { continue }
            key.removeFirst()
            key.removeLast()
            parts.append("\(key):\(s)")
        }
        return "{" + parts.joined(separator: ",") + "}"
    }
}

// holt neue Versionen von ytx von GitHub, sie gelten ab dem naechsten Start
enum CodeUpdater {
    static let raw = URL(string: "https://raw.githubusercontent.com/jakobus744/youtube_plugin/main/dist/ytx.user.js")!
    static let every: TimeInterval = 6 * 3600

    static func version(of code: String) -> String {
        guard let r = code.range(of: #"@version\s+([\d.]+)"#, options: .regularExpression) else { return "0" }
        return String(code[r]).split(whereSeparator: { $0 == " " || $0 == "\t" }).last.map(String.init) ?? "0"
    }

    static func isNewer(_ a: String, than b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }
        let y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let p = i < x.count ? x[i] : 0
            let q = i < y.count ? y[i] : 0
            if p != q { return p > q }
        }
        return false
    }

    // mitgelieferte Version, ausser gespeicherte ist neuer
    static func current() -> (code: String, version: String)? {
        guard let url = Bundle.main.url(forResource: "ytx.user", withExtension: "js"),
              let base = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        let baseVer = version(of: base)
        if let c = UserDefaults.standard.string(forKey: "code"),
           let v = UserDefaults.standard.string(forKey: "codeVersion"), isNewer(v, than: baseVer) {
            return (c, v)
        }
        return (base, baseVer)
    }

    static func checkIfDue() {
        let last = UserDefaults.standard.double(forKey: "codeChecked")
        guard Date().timeIntervalSince1970 - last > every else { return }
        var req = URLRequest(url: raw, cachePolicy: .reloadIgnoringLocalCacheData)
        req.timeoutInterval = 15
        URLSession.shared.dataTask(with: req) { data, resp, _ in
            guard let data, (resp as? HTTPURLResponse)?.statusCode == 200,
                  let code = String(data: data, encoding: .utf8), code.contains("==UserScript==") else { return }
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "codeChecked")
            let v = version(of: code)
            if let cur = current(), isNewer(v, than: cur.version) {
                UserDefaults.standard.set(code, forKey: "code")
                UserDefaults.standard.set(v, forKey: "codeVersion")
            }
        }.resume()
    }
}
