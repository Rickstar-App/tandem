// Dump the text of each PDF page as JSON: swift tools/pdf_pages.swift in.pdf out.json
import Foundation
import PDFKit
let a = CommandLine.arguments
guard a.count == 3, let doc = PDFDocument(url: URL(fileURLWithPath: a[1])) else { print("usage: pdf_pages in.pdf out.json"); exit(1) }
var pages: [String] = []
for i in 0..<doc.pageCount { pages.append(doc.page(at: i)?.string ?? "") }
try JSONSerialization.data(withJSONObject: pages).write(to: URL(fileURLWithPath: a[2]))
print("pages \(pages.count)")
