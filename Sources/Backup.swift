import SwiftUI
import UniformTypeIdentifiers
import PencilKit

/// Everything needed to bring the book back: pages, writing history,
/// tuning, and where the thumb button sits. Saved as one readable JSON file.
struct BackupPayload: Codable {
    var format: String = "tree-of-life-backup"
    var version: Int = 1
    var exportedAt: Date
    var pages: [String: Data]               // page id → PencilKit drawing
    var writingSeconds: [String: TimeInterval] // "yyyy-MM-dd" → seconds
    var tuning: [String: Double]
    var thumbX: Double?
    var thumbY: Double?
}

struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        guard let contents = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        data = contents
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

enum Backup {
    static func make(clock: WritingClock, tuning: Tuning) throws -> Data {
        let defaults = UserDefaults.standard
        let payload = BackupPayload(
            exportedAt: Date(),
            pages: [PageStore.pageID: PageStore.current().dataRepresentation()],
            writingSeconds: clock.history,
            tuning: tuning.values,
            thumbX: defaults.object(forKey: "thumbX") as? Double,
            thumbY: defaults.object(forKey: "thumbY") as? Double
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(payload)
    }

    /// Checks the file first; only replaces anything once the whole file has read correctly.
    static func restore(_ data: Data, clock: WritingClock, tuning: Tuning) throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let payload = try decoder.decode(BackupPayload.self, from: data)
        guard payload.format == "tree-of-life-backup" else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let drawing = try payload.pages[PageStore.pageID].map { try PKDrawing(data: $0) }

        if let drawing {
            PageStore.save(drawing)
        }
        clock.replaceHistory(payload.writingSeconds)
        tuning.replaceAll(payload.tuning)
        let defaults = UserDefaults.standard
        if let x = payload.thumbX { defaults.set(x, forKey: "thumbX") }
        if let y = payload.thumbY { defaults.set(y, forKey: "thumbY") }
    }

    static var suggestedFilename: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd-HHmm"
        return "TreeOfLife-backup-\(f.string(from: Date()))"
    }
}
