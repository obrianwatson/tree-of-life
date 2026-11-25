import SwiftUI

@main
struct TreeOfLifeApp: App {
    @StateObject private var clock = WritingClock()

    var body: some Scene {
        WindowGroup {
            PageView()
                .environmentObject(clock)
        }
    }
}
