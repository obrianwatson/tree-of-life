import SwiftUI

struct PageView: View {
    @EnvironmentObject var clock: WritingClock
    @EnvironmentObject var tuning: Tuning
    @Environment(\.scenePhase) private var scenePhase

    @State private var reloadToken = UUID()
    @State private var showTuning = false
    @State private var exporting = false
    @State private var exportDocument: BackupDocument?
    @State private var importing = false
    @State private var pendingRestore: Data?
    @State private var notice: String?

    var body: some View {
        ZStack(alignment: .top) {
            CanvasView(clock: clock, tuning: tuning, reloadToken: reloadToken)
                .ignoresSafeArea()

            ClockBadge()
                .padding(.top, 10)

            HStack {
                Spacer()
                controls
            }
            .padding(.top, 10)
            .padding(.trailing, 16)

            ThumbButton()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active {
                clock.releaseAll()
            }
        }
        .alert("Restore this backup?",
               isPresented: Binding(get: { pendingRestore != nil },
                                    set: { if !$0 { pendingRestore = nil } })) {
            Button("Restore", role: .destructive) { restorePending() }
            Button("Cancel", role: .cancel) { pendingRestore = nil }
        } message: {
            Text("Your current page, writing history and tuning will be replaced by what's in the backup.")
        }
    }

    private var controls: some View {
        HStack(spacing: 10) {
            Menu {
                Button {
                    exportBackup()
                } label: {
                    Label("Export backup…", systemImage: "square.and.arrow.up")
                }
                Button {
                    importing = true
                } label: {
                    Label("Restore from backup…", systemImage: "square.and.arrow.down")
                }
            } label: {
                ControlIcon(systemName: "archivebox")
            }
            .fileExporter(isPresented: $exporting,
                          document: exportDocument,
                          contentType: .json,
                          defaultFilename: Backup.suggestedFilename) { result in
                switch result {
                case .success: notice = "Backup saved."
                case .failure(let error): notice = "Backup not saved: \(error.localizedDescription)"
                }
            }

            Button {
                showTuning = true
            } label: {
                ControlIcon(systemName: "slider.horizontal.3")
            }
            .popover(isPresented: $showTuning) {
                TuningPanel()
                    .environmentObject(tuning)
                    .frame(minWidth: 400, minHeight: 560)
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url):
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    do {
                        pendingRestore = try Data(contentsOf: url)
                    } catch {
                        notice = "Couldn't open that file: \(error.localizedDescription)"
                    }
                case .failure(let error):
                    notice = "Couldn't open that file: \(error.localizedDescription)"
                }
            }
        }
        .alert(notice ?? "",
               isPresented: Binding(get: { notice != nil },
                                    set: { if !$0 { notice = nil } })) {
            Button("OK") { notice = nil }
        }
    }

    private func exportBackup() {
        do {
            exportDocument = BackupDocument(data: try Backup.make(clock: clock, tuning: tuning))
            exporting = true
        } catch {
            notice = "Couldn't make a backup: \(error.localizedDescription)"
        }
    }

    private func restorePending() {
        guard let data = pendingRestore else { return }
        pendingRestore = nil
        do {
            try Backup.restore(data, clock: clock, tuning: tuning)
            reloadToken = UUID()
            notice = "Backup restored."
        } catch {
            notice = "That file isn't a Tree of Life backup, or it's damaged. Nothing was changed."
        }
    }
}

struct ControlIcon: View {
    let systemName: String

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 17, weight: .medium))
            .foregroundColor(.primary)
            .frame(width: 40, height: 40)
            .background(.ultraThinMaterial, in: Circle())
    }
}

/// Today's writing time, with a dot that turns green while the clock runs.
struct ClockBadge: View {
    @EnvironmentObject var clock: WritingClock
    @EnvironmentObject var tuning: Tuning

    var body: some View {
        TimelineView(.periodic(from: Date(), by: 1)) { context in
            let total = clock.todayTotal(at: context.date)
            HStack(spacing: 10) {
                Circle()
                    .fill(clock.isActive ? Color.green : Color.gray.opacity(0.4))
                    .frame(width: 10, height: 10)
                Text(Self.format(total))
                    .font(.system(.title3, design: .rounded).monospacedDigit())
                Text("of \(Self.format(tuning[.dailyGoalHours] * 3600))")
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
    @EnvironmentObject var tuning: Tuning
    @AppStorage("thumbX") private var x: Double = 70
    @AppStorage("thumbY") private var y: Double = 720
    @State private var moving: CGSize = .zero

    var body: some View {
        let size = CGFloat(tuning[.thumbButtonSize])
        let restingOpacity = tuning[.thumbButtonOpacity]

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
                .fill(clock.thumbDown ? Color.green.opacity(0.85) : Color.gray.opacity(0.45 * restingOpacity))
                .overlay(
                    Circle().stroke(Color.secondary.opacity(0.7 * restingOpacity), lineWidth: 1)
                )
                .frame(width: size, height: size)
                .overlay(
                    Text(clock.thumbDown ? "writing" : "hold")
                        .font(.footnote.weight(.medium))
                        .foregroundColor(clock.thumbDown ? .white : .secondary)
                        .opacity(clock.thumbDown ? 1 : restingOpacity + 0.3)
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
