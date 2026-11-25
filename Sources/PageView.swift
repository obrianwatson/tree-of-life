import SwiftUI

struct PageView: View {
    @EnvironmentObject var clock: WritingClock
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack(alignment: .top) {
            CanvasView(clock: clock)
                .ignoresSafeArea()

            ClockBadge()
                .padding(.top, 10)

            ThumbButton()
        }
        .onChange(of: scenePhase) { phase in
            if phase != .active {
                clock.releaseAll()
            }
        }
    }
}

/// Today's writing time, with a dot that turns green while the clock runs.
struct ClockBadge: View {
    @EnvironmentObject var clock: WritingClock

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { context in
            let total = clock.todayTotal(at: context.date)
            HStack(spacing: 10) {
                Circle()
                    .fill(clock.isActive ? Color.green : Color.gray.opacity(0.4))
                    .frame(width: 10, height: 10)
                Text(Self.format(total))
                    .font(.system(.title3, design: .rounded).monospacedDigit())
                Text("of 5:00:00")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial, in: Capsule())
        }
        .allowsHitTesting(false)
    }

    static func format(_ seconds: TimeInterval) -> String {
        let s = Int(seconds)
        return String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
    }
}

/// The floating thumb button. Hold the circle to count time.
/// Drag the small bar above it to move it where your hand rests;
/// the spot is remembered.
struct ThumbButton: View {
    @EnvironmentObject var clock: WritingClock
    @AppStorage("thumbX") private var x: Double = 70
    @AppStorage("thumbY") private var y: Double = 720
    @State private var moving: CGSize = .zero

    var body: some View {
        VStack(spacing: 4) {
            Capsule()
                .fill(Color.secondary.opacity(0.5))
                .frame(width: 34, height: 6)
                .padding(10)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture()
                        .onChanged { moving = $0.translation }
                        .onEnded { value in
                            x += value.translation.width
                            y += value.translation.height
                            moving = .zero
                        }
                )

            Circle()
                .fill(clock.thumbDown ? Color.green.opacity(0.85) : Color.gray.opacity(0.22))
                .overlay(
                    Circle().stroke(Color.secondary.opacity(0.35), lineWidth: 1)
                )
                .frame(width: 88, height: 88)
                .overlay(
                    Text(clock.thumbDown ? "writing" : "hold")
                        .font(.footnote.weight(.medium))
                        .foregroundColor(clock.thumbDown ? .white : .secondary)
                )
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { _ in clock.setThumb(true) }
                        .onEnded { _ in clock.setThumb(false) }
                )
        }
        .position(x: x + moving.width, y: y + moving.height)
    }
}
