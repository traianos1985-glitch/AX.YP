import fs from 'node:fs'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const filePath = new URL('../dossier-templates-data.js', import.meta.url)
const source = fs.readFileSync(filePath, 'utf8')
const exportPattern = /(export const DEFAULT_COUNTERFEIT_TEMPLATES\s*=\s*)(\[[\s\S]*?\])(\s*;)/
const exportMatch = source.match(exportPattern)
if (!exportMatch) throw new Error('DEFAULT_COUNTERFEIT_TEMPLATES export not found')

const templates = JSON.parse(exportMatch[2])
const targetIds = ['counterfeit-02', 'counterfeit-03']
const placeholder = '{{counterfeit.serialNumber}}'

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

function encodeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function patchDocument(xml, id) {
  if (xml.includes(placeholder)) return xml
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
  if (id === 'counterfeit-03') {
    for (const paragraphMatch of paragraphs) {
      const paragraph = paragraphMatch[0]
      const text = [...paragraph.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)].map((node) => decodeXml(node[2])).join('')
      if (/χαρτονόμισμα/i.test(text) && /πιθανόν πλαστό/i.test(text)) {
        const addition = '<w:r><w:t xml:space="preserve"> Σειριακός αριθμός του εξεταζόμενου χαρτονομίσματος: ' + placeholder + '.</w:t></w:r>'
        const updatedParagraph = paragraph.replace(/<\/w:p>$/, addition + '</w:p>')
        return xml.slice(0, paragraphMatch.index) + updatedParagraph + xml.slice(paragraphMatch.index + paragraph.length)
      }
    }
    throw new Error(id + ': could not locate the examined-banknote paragraph')
  }
  for (const paragraphMatch of paragraphs) {
    const paragraph = paragraphMatch[0]
    const nodes = [...paragraph.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)]
    const texts = nodes.map((node) => decodeXml(node[2]))
    const plain = texts.join('')
    const anchor = /αριθ\.?/i.exec(plain)
    if (!anchor) continue
    const afterAnchor = anchor.index + anchor[0].length
    const remainder = plain.slice(afterAnchor)
    const dots = /(?:\.{4,}|…{2,}|_{4,})/.exec(remainder)
    if (!dots) continue

    const masked = plain.split(/(\s+)/).map((token) => {
      if (/^\s+$/.test(token) || /^[. …_]+$/.test(token) || /αριθ|σειρια|χαρτονόμισμα|πλαστ|υπ/i.test(token)) return token
      return token ? '[token:' + token.length + ']' : token
    }).join('')
    console.log('Serial target paragraph ' + id + ': ' + masked)
    const rangeStart = afterAnchor + dots.index
    const rangeEnd = rangeStart + dots[0].length
    let offset = 0
    let firstOverlap = -1
    const spans = nodes.map((node, index) => {
      const start = offset
      const end = start + texts[index].length
      offset = end
      if (end > rangeStart && start < rangeEnd && firstOverlap < 0) firstOverlap = index
      return { start, end }
    })
    if (firstOverlap < 0) continue

    let updatedParagraph = paragraph
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index]
      const span = spans[index]
      const overlapStart = Math.max(span.start, rangeStart)
      const overlapEnd = Math.min(span.end, rangeEnd)
      if (overlapStart >= overlapEnd) continue
      const localStart = overlapStart - span.start
      const localEnd = overlapEnd - span.start
      const replacement = index === firstOverlap ? placeholder : ''
      const updatedText = texts[index].slice(0, localStart) + replacement + texts[index].slice(localEnd)
      const updatedNode = '<w:t' + node[1] + '>' + encodeXml(updatedText) + '</w:t>'
      updatedParagraph = updatedParagraph.slice(0, node.index) + updatedNode + updatedParagraph.slice(node.index + node[0].length)
    }

    return xml.slice(0, paragraphMatch.index) + updatedParagraph + xml.slice(paragraphMatch.index + paragraph.length)
  }
  const diagnostics = paragraphs.map((match, index) => {
    const text = [...match[0].matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)].map((node) => decodeXml(node[2])).join('')
    const dotRuns = [...text.matchAll(/(?:\.{2,}|…+|_{2,})/g)].map((entry) => ({ start: entry.index, length: entry[0].length }))
    const masked = text.split(/(\\s+)/).map((token) => {
      if (/^\\s+$/.test(token) || /^[. …_]+$/.test(token) || /αριθ|σειρια|χαρτονόμισμα|πλαστ|υπ/i.test(token)) return token
      return token ? '[token:' + token.length + ']' : token
    }).join('')
    return { index, hasNumberWord: /αριθ/i.test(text), hasSerialWord: /σειρια/i.test(text), hasBanknoteWord: /χαρτονόμισμα/i.test(text), dotRuns, masked }
  }).filter((entry) => entry.hasNumberWord || entry.hasSerialWord || entry.hasBanknoteWord || entry.dotRuns.length)
  console.log('Template structure diagnostics ' + id + ': ' + JSON.stringify(diagnostics))
  throw new Error(id + ': could not locate a dotted serial-number blank after the “αριθ.” label')
}

for (const id of targetIds) {
  const template = templates.find((entry) => entry.id === id)
  if (!template) throw new Error(id + ': template not found')
  if (!template.fields.includes('counterfeit.serialNumber')) throw new Error(id + ': serial-number field is not declared')
  const archive = unzipSync(Buffer.from(template.dataBase64, 'base64'))
  if (!archive['word/document.xml']) throw new Error(id + ': missing Word document XML')
  const xml = strFromU8(archive['word/document.xml'])
  const patchedXml = patchDocument(xml, id)
  archive['word/document.xml'] = strToU8(patchedXml)
  const rebuilt = zipSync(archive, { level: 6 })
  const verification = unzipSync(rebuilt)
  const verifiedXml = strFromU8(verification['word/document.xml'])
  if (!verifiedXml.includes(placeholder)) throw new Error(id + ': serial placeholder did not survive DOCX rebuild')
  template.dataBase64 = Buffer.from(rebuilt).toString('base64')
}
const updatedArray = JSON.stringify(templates)
const updatedSource = source.slice(0, exportMatch.index) +
  exportMatch[1] + updatedArray + exportMatch[3] +
  source.slice(exportMatch.index + exportMatch[0].length)
fs.writeFileSync(filePath, updatedSource)
console.log('Patched and re-opened the embedded DOCX archives for counterfeit-02 and counterfeit-03.')
