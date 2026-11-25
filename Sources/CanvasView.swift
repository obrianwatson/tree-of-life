import SwiftUI
import PencilKit

/// One page of the book: Apple's PencilKit canvas, with the Pencil
/// reporting to the writing clock and the page following live tuning.
struct CanvasView: UIViewRepresentable {
    let clock: WritingClock
    @ObservedObject var tuning: Tuning
    /// Changes when the page must be reloaded from disk (after a restore).
    let reloadToken: UUID

    func makeCoordinator() -> Coordinator {
        Coordinator(clock: clock)
    }

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.delegate = context.coordinator
        canvas.isOpaque = true
        canvas.minimumZoomScale = 0.5
        canvas.bouncesZoom = true
        canvas.alwaysBounceVertical = true
        canvas.contentSize = CGSize(width: 1600, height: 4000)
        canvas.tool = PKInkingTool(.pen, color: .black, width: 2)
        canvas.drawing = PageStore.load()
        applyTuning(to: canvas)
        context.coordinator.reloadToken = reloadToken

        let picker = PKToolPicker()
        picker.addObserver(canvas)
        picker.setVisible(true, forFirstResponder: canvas)
        context.coordinator.picker = picker
        DispatchQueue.main.async {
            canvas.becomeFirstResponder()
        }
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        applyTuning(to: canvas)
        if context.coordinator.reloadToken != reloadToken {
            context.coordinator.reloadToken = reloadToken
            canvas.drawing = PageStore.load()
        }
    }

    private func applyTuning(to canvas: PKCanvasView) {
        // Off: only the Pencil writes and fingers scroll. On: fingers draw too.
        canvas.drawingPolicy = tuning[.fingerDraws] >= 0.5 ? .anyInput : .pencilOnly
        canvas.maximumZoomScale = CGFloat(tuning[.maxZoom])
        if canvas.zoomScale > canvas.maximumZoomScale {
            canvas.setZoomScale(canvas.maximumZoomScale, animated: true)
        }
        let w = CGFloat(tuning[.pageWarmth])
        canvas.backgroundColor = UIColor(red: 1 - 0.02 * w, green: 1 - 0.06 * w, blue: 1 - 0.14 * w, alpha: 1)
    }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let clock: WritingClock
        var picker: PKToolPicker?
        var reloadToken = UUID()
        private var pendingSave: DispatchWorkItem?

        init(clock: WritingClock) {
            self.clock = clock
        }

        // The tip touches the page. Only writing and drawing tools count;
        // erasing and lasso selection do not.
        func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) {
            if canvasView.tool is PKInkingTool {
                clock.setPencil(true)
            }
        }

        // The tip lifts. That input ends immediately.
        func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
            clock.setPencil(false)
        }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            let drawing = canvasView.drawing
            PageStore.latest = drawing
            pendingSave?.cancel()
            let work = DispatchWorkItem { PageStore.save(drawing) }
            pendingSave = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
        }
    }
}

/// Keeps the page on the iPad between launches.
enum PageStore {
    static let pageID = "page-1"

    /// The newest version of the page, even if it hasn't been written to disk yet.
    static var latest: PKDrawing?

    private static var url: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("\(pageID).drawing")
    }

    static func load() -> PKDrawing {
        guard let data = try? Data(contentsOf: url),
              let drawing = try? PKDrawing(data: data) else { return PKDrawing() }
        return drawing
    }

    static func current() -> PKDrawing {
        latest ?? load()
    }

    static func save(_ drawing: PKDrawing) {
        latest = drawing
        try? drawing.dataRepresentation().write(to: url, options: .atomic)
    }
}
