const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Remove common privacy-sensitive image metadata without re-encoding pixels. */
export function stripImageMetadata(data: Buffer, mimeType: string): Buffer {
  if (mimeType === 'image/png' || data.subarray(0, 8).equals(PNG_SIGNATURE)) return stripPngMetadata(data)
  if (mimeType === 'image/jpeg' || data.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) return stripJpegMetadata(data)
  if (mimeType === 'image/webp' || data.toString('ascii', 0, 4) === 'RIFF') return stripWebpMetadata(data)
  if (mimeType === 'image/svg+xml') return stripSvgMetadata(data)
  return data
}

function stripPngMetadata(data: Buffer): Buffer {
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) return data
  const chunks: Buffer[] = [data.subarray(0, 8)]
  let offset = 8
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > data.length) return data
    const type = data.toString('ascii', offset + 4, offset + 8)
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf'].includes(type)) chunks.push(data.subarray(offset, end))
    offset = end
  }
  return offset === data.length ? Buffer.concat(chunks) : data
}

function stripJpegMetadata(data: Buffer): Buffer {
  if (data.length < 2 || data[0] !== 0xff || data[1] !== 0xd8) return data
  const chunks: Buffer[] = [data.subarray(0, 2)]
  let offset = 2
  while (offset + 1 < data.length) {
    if (data[offset] !== 0xff) return data
    const marker = data[offset + 1]
    if (marker === 0xda) { chunks.push(data.subarray(offset)); return Buffer.concat(chunks) }
    if (marker === 0xd9) { chunks.push(data.subarray(offset, offset + 2)); return Buffer.concat(chunks) }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(data.subarray(offset, offset + 2)); offset += 2; continue
    }
    if (offset + 4 > data.length) return data
    const length = data.readUInt16BE(offset + 2)
    const end = offset + 2 + length
    if (length < 2 || end > data.length) return data
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) chunks.push(data.subarray(offset, end))
    offset = end
  }
  return data
}

function stripWebpMetadata(data: Buffer): Buffer {
  if (data.length < 12 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') return data
  const chunks: Buffer[] = [data.subarray(0, 12)]
  let offset = 12
  while (offset + 8 <= data.length) {
    const size = data.readUInt32LE(offset + 4)
    const end = offset + 8 + size + (size % 2)
    if (end > data.length) return data
    const type = data.toString('ascii', offset, offset + 4)
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(data.subarray(offset, end))
    offset = end
  }
  if (offset !== data.length) return data
  const result = Buffer.concat(chunks)
  result.writeUInt32LE(result.length - 8, 4)
  return result
}

function stripSvgMetadata(data: Buffer): Buffer {
  const source = data.toString('utf8')
  if (!/<svg[\s>]/i.test(source)) return data
  const cleaned = source.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
  return cleaned === source ? data : Buffer.from(cleaned, 'utf8')
}
