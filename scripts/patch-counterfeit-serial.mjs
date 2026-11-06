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
  const label = 'Σειριακός αριθμός πλαστού χαρτονομίσματος: ' + placeholder
  if (xml.includes(label)) return xml
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]

  if (id === 'counterfeit-02') {
    for (const paragraphMatch of paragraphs) {
      const paragraph = paragraphMatch[0]
      const plain = [...paragraph.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)].map((node) => decodeXml(node[2])).join('')
      if (!plain.includes('με αριθμό ' + placeholder)) continue
      const updatedParagraph = paragraph.replace('με αριθμό ' + placeholder, label)
      return xml.slice(0, paragraphMatch.index) + updatedParagraph + xml.slice(paragraphMatch.index + paragraph.length)
    }
    throw new Error(id + ': existing serial-number field not found in the seizure statement')
  }

  if (id === 'counterfeit-03') {
    for (const paragraphMatch of paragraphs) {
      const paragraph = paragraphMatch[0]
      const plain = [...paragraph.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)].map((node) => decodeXml(node[2])).join('')
      if (!/χαρτονόμισμα/i.test(plain) || !/πιθανόν πλαστό/i.test(plain)) continue
      const addition = '<w:r><w:t xml:space="preserve"> ' + label + '.</w:t></w:r>'
      const updatedParagraph = paragraph.replace(/<\/w:p>$/, addition + '</w:p>')
      return xml.slice(0, paragraphMatch.index) + updatedParagraph + xml.slice(paragraphMatch.index + paragraph.length)
    }
    throw new Error(id + ': examined-banknote paragraph not found in the forensic-laboratory form')
  }

  throw new Error(id + ': no patch rule defined')
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
