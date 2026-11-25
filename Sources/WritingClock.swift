import Foundation
import Combine

/// The writing clock. It runs while the Pencil tip is down with a writing
/// tool, or while the thumb button is held. When both are active, each
/// second still counts once.
final class WritingClock: ObservableObject {
    @Published private(set) var pencilDown = false
    @Published private(set) var thumbDown = false

    private var activeSince: Date?
    private var banked: [String: TimeInterval]
    private let storeKey = "dailyWritingSeconds"

    static let dailyGoal: TimeInterval = 5 * 60 * 60

    init() {
        banked = (UserDefaults.standard.dictionary(forKey: storeKey) as? [String: TimeInterval]) ?? [:]
    }

    var isActive: Bool { pencilDown || thumbDown }

    func setPencil(_ down: Bool) {
        guard down != pencilDown else { return }
        transition { self.pencilDown = down }
    }

    func setThumb(_ down: Bool) {
        guard down != thumbDown else { return }
        transition { self.thumbDown = down }
    }

    /// Called when the app leaves the screen, so no time is counted in the background.
    func releaseAll() {
        transition {
            self.pencilDown = false
            self.thumbDown = false
        }
    }

    /// Today's total, including the stretch that is running right now.
    func todayTotal(at now: Date = Date()) -> TimeInterval {
        var total = banked[Self.dayKey(for: now)] ?? 0
        if let start = activeSince {
            let dayStart = Calendar.current.startOfDay(for: now)
            total += max(0, now.timeIntervalSince(max(start, dayStart)))
        }
        return total
    }

    private func transition(_ change: () -> Void) {
        let wasActive = isActive
        change()
        let now = Date()
        if !wasActive && isActive {
            activeSince = now
        } else if wasActive && !isActive {
            bank(until: now)
        }
    }

    /// Adds the finished stretch to the right day, splitting it at midnight.
    private func bank(until now: Date) {
        guard var cursor = activeSince else { return }
        let calendar = Calendar.current
        while cursor < now {
            let startOfDay = calendar.startOfDay(for: cursor)
            let nextMidnight = calendar.date(byAdding: .day, value: 1, to: startOfDay) ?? now
            let end = min(now, nextMidnight)
            banked[Self.dayKey(for: cursor), default: 0] += end.timeIntervalSince(cursor)
            cursor = end
        }
        activeSince = nil
        UserDefaults.standard.set(banked, forKey: storeKey)
    }

    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func dayKey(for date: Date) -> String {
        formatter.string(from: date)
    }
}
