import SwiftUI
import PencilKit

/// One page of the book: Apple's PencilKit canvas, with the Pencil
/// reporting to the writing clock.
struct CanvasView: UIViewRepresentable {
    let clock: WritingClock

    func makeCoordinator() -> Coordinator {
        Coordinator(clock: clock)
    }

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.delegate = context.coordinator
        canvas.drawingPolicy = .pencilOnly          // fingers scroll and zoom; only the Pencil writes
        canvas.backgroundColor = UIColor(red: 0.99, green: 0.97, blue: 0.93, alpha: 1)
        canvas.isOpaque = true
        canvas.minimumZoomScale = 0.5
        canvas.maximumZoomScale = 5
        canvas.bouncesZoom = true
        canvas.alwaysBounceVertical = true
        canvas.contentSize = CGSize(width: 1600, height: 4000)
        canvas.tool = PKInkingTool(.pen, color: .black, width: 2)
        canvas.drawing = PageStore.load()

        let picker = PKToolPicker()
        picker.addObserver(canvas)
        picker.setVisible(true, forFirstResponder: canvas)
        context.coordinator.picker = picker
        DispatchQueue.main.async {
            canvas.becomeFirstResponder()
        }
        return canvas
    }

    func updateUIView(_ uiView: PKCanvasView, context: Context) {}

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        let clock: WritingClock
        var picker: PKToolPicker?
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
            pendingSave?.cancel()
            let drawing = canvasView.drawing
            let work = DispatchWorkItem { PageStore.save(drawing) }
            pendingSave = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 1, execute: work)
        }
    }
}

/// Keeps the page on the iPad between launches.
enum PageStore {
    private static var url: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("page-1.drawing")
    }

    static func load() -> PKDrawing {
        guard let data = try? Data(contentsOf: url),
              let drawing = try? PKDrawing(data: data) else { return PKDrawing() }
        return drawing
    }

    static func save(_ drawing: PKDrawing) {
        try? drawing.dataRepresentation().write(to: url, options: .atomic)
    }
}
