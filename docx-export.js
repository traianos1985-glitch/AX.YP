// Minimal .docx writer: a Word package made of a few XML parts stored in a ZIP container. No external dependency.
(function () {
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch];
    });
  }

  function zip(files) {
    var encoder = new TextEncoder();
    var chunks = [];
    var central = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var data = encoder.encode(file.content);
      var crc = crc32(data);
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, 0, true);
      local.setUint16(12, 0x21, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      chunks.push(new Uint8Array(local.buffer), name, data);

      var entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(12, 0, true);
      entry.setUint16(14, 0x21, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, data.length, true);
      entry.setUint32(24, data.length, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);
      central.push(new Uint8Array(entry.buffer), name);

      offset += 30 + name.length + data.length;
    });
    var centralSize = central.reduce(function (sum, part) { return sum + part.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function run(text, bold) {
    return '<w:r>' + (bold ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
  }

  function paragraph(text, bold, style) {
    return '<w:p>' + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '') + run(text, bold) + '</w:p>';
  }

  function cell(text, width, bold) {
    return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/></w:tcPr>' + paragraph(text, bold) + '</w:tc>';
  }

  function table(rows) {
    var border = '<w:%s w:val="single" w:sz="4" w:space="0" w:color="999999"/>';
    var borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (side) {
      return border.replace('%s', side);
    }).join('');
    var body = rows.map(function (row) {
      return '<w:tr>' + cell(row[0], 3000, true) + cell(row[1] || '—', 6000, false) + '</w:tr>';
    }).join('');
    return '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>' + borders + '</w:tblBorders></w:tblPr>' +
      '<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="6000"/></w:tblGrid>' + body + '</w:tbl>';
  }

  // Builds a Word document with a title, a warning line, a table of label/value rows and a source line.
  function createDocument(options) {
    var body = paragraph(options.title, true, 'Heading1') +
      paragraph(options.notice, true) +
      table(options.rows) +
      paragraph('Πηγή πρωτοτύπου: ' + options.source, false);
    var documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
    var blob = zip([
      { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/_rels/document.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'word/document.xml', content: documentXml },
      { name: 'word/styles.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>' }
    ]);
    return blob;
  }

  function open(options) {
    var url = URL.createObjectURL(createDocument(options));
    var opened = window.open(url, '_blank', 'noopener');
    if (!opened) {
      var link = document.createElement('a');
      link.href = url;
      link.download = options.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return !!opened;
  }

  function download(options) {
    var url = URL.createObjectURL(createDocument(options));
    var link = document.createElement('a');
    link.href = url;
    link.download = options.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.DocxExport = { download: download, open: open };
})();
