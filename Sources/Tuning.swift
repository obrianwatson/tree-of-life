import SwiftUI

/// Every feel-setting of the app, in one place.
/// Changing a value takes effect immediately, with no rebuild.
/// Later, Claude inside the app will read and set these same keys.
enum TuningKey: String, CaseIterable, Codable, Identifiable {
    case dailyGoalHours
    case thumbButtonSize
    case thumbButtonOpacity
    case pageWarmth
    case maxZoom
    case fingerDraws

    var id: String { rawValue }

    var title: String {
        switch self {
        case .dailyGoalHours: return "Daily goal"
        case .thumbButtonSize: return "Thumb button size"
        case .thumbButtonOpacity: return "Thumb button visibility"
        case .pageWarmth: return "Page warmth"
        case .maxZoom: return "Maximum zoom"
        case .fingerDraws: return "Fingers can draw"
        }
    }

    var detail: String {
        switch self {
        case .dailyGoalHours: return "The total shown at the top of the page."
        case .thumbButtonSize: return "How big the thumb button is."
        case .thumbButtonOpacity: return "How visible the thumb button is when you're not holding it."
        case .pageWarmth: return "From white paper to warm cream."
        case .maxZoom: return "How far you can pinch in."
        case .fingerDraws: return "Off: only the Pencil writes, fingers scroll. On: fingers draw too, and that counts as writing time."
        }
    }

    var range: ClosedRange<Double> {
        switch self {
        case .dailyGoalHours: return 1...12
        case .thumbButtonSize: return 56...150
        case .thumbButtonOpacity: return 0.1...1
        case .pageWarmth: return 0...1
        case .maxZoom: return 2...10
        case .fingerDraws: return 0...1
        }
    }

    var step: Double {
        switch self {
        case .dailyGoalHours: return 0.5
        case .thumbButtonSize: return 2
        case .thumbButtonOpacity: return 0.05
        case .pageWarmth: return 0.05
        case .maxZoom: return 0.5
        case .fingerDraws: return 1
        }
    }

    var defaultValue: Double {
        switch self {
        case .dailyGoalHours: return 5
        case .thumbButtonSize: return 88
        case .thumbButtonOpacity: return 0.5
        case .pageWarmth: return 0.5
        case .maxZoom: return 5
        case .fingerDraws: return 0
        }
    }

    var isToggle: Bool { self == .fingerDraws }

    func format(_ value: Double) -> String {
        switch self {
        case .dailyGoalHours: return String(format: value == value.rounded() ? "%.0f h" : "%.1f h", value)
        case .thumbButtonSize: return String(format: "%.0f pt", value)
        case .thumbButtonOpacity, .pageWarmth: return String(format: "%.0f%%", value * 100)
        case .maxZoom: return String(format: "%.1f×", value)
        case .fingerDraws: return value >= 0.5 ? "On" : "Off"
        }
    }
}

final class Tuning: ObservableObject {
    @Published private(set) var values: [String: Double]
    private let storeKey = "tuning"

    init() {
        values = (UserDefaults.standard.dictionary(forKey: storeKey) as? [String: Double]) ?? [:]
    }

    subscript(key: TuningKey) -> Double {
        values[key.rawValue] ?? key.defaultValue
    }

    func set(_ key: TuningKey, _ value: Double) {
        values[key.rawValue] = min(max(value, key.range.lowerBound), key.range.upperBound)
        save()
    }

    func reset(_ key: TuningKey) {
        values[key.rawValue] = nil
        save()
    }

    func resetAll() {
        values = [:]
        save()
    }

    /// Used when restoring a backup. Unknown keys are ignored.
    func replaceAll(_ newValues: [String: Double]) {
        values = newValues.filter { TuningKey(rawValue: $0.key) != nil }
        save()
    }

    func binding(_ key: TuningKey) -> Binding<Double> {
        Binding(get: { self[key] }, set: { self.set(key, $0) })
    }

    private func save() {
        UserDefaults.standard.set(values, forKey: storeKey)
    }
}

/// The tuning panel: sliders and switches that change the app live.
struct TuningPanel: View {
    @EnvironmentObject var tuning: Tuning

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(TuningKey.allCases) { key in
                        TuningRow(key: key)
                    }
                } footer: {
                    Text("Changes apply right away. Your writing time always follows the Pencil-and-thumb rule.")
                }
                Section {
                    Button("Reset everything to defaults", role: .destructive) {
                        tuning.resetAll()
                    }
                }
            }
            .navigationTitle("Tuning")
        }
    }
}

struct TuningRow: View {
    @EnvironmentObject var tuning: Tuning
    let key: TuningKey

    var body: some View {
        if key.isToggle {
            Toggle(isOn: Binding(get: { tuning[key] >= 0.5 },
                                 set: { tuning.set(key, $0 ? 1 : 0) })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(key.title)
                    Text(key.detail).font(.caption).foregroundColor(.secondary)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(key.title)
                    Spacer()
                    Text(key.format(tuning[key]))
                        .monospacedDigit()
                        .foregroundColor(.secondary)
                }
                Slider(value: tuning.binding(key), in: key.range, step: key.step)
                Text(key.detail).font(.caption).foregroundColor(.secondary)
            }
            .padding(.vertical, 4)
        }
    }
}
