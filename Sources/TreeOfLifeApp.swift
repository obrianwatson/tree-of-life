import SwiftUI

@main
struct TreeOfLifeApp: App {
    @StateObject private var clock = WritingClock()
    @StateObject private var tuning = Tuning()

    var body: some Scene {
        WindowGroup {
            PageView()
                .environmentObject(clock)
                .environmentObject(tuning)
        }
    }
}
