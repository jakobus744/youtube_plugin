import UIKit
import AVFoundation

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Ton laeuft weiter bei gesperrtem Bildschirm, passend zu UIBackgroundModes audio
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = WebController()
        w.makeKeyAndVisible()
        window = w
        return true
    }
}
