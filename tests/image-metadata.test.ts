import { describe, expect, it } from 'vitest'
import { stripImageMetadata } from '../src/main/services/image-metadata'

describe('stripImageMetadata', () => {
  it('removes PNG text and EXIF chunks while preserving the PNG envelope', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 5, 0x74, 0x45, 0x58, 0x74, 0x41, 0x42, 0x43, 0x44, 0x45, 0, 0, 0, 0,
      0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
    ])
    const cleaned = stripImageMetadata(png, 'image/png')
    expect(cleaned.subarray(0, 8)).toEqual(png.subarray(0, 8))
    expect(cleaned.toString('latin1')).not.toContain('tEXt')
    expect(cleaned.toString('latin1')).toContain('IEND')
  })

  it('removes JPEG APP1/COM metadata segments and leaves image markers', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 6, 0x45, 0x58, 0x49, 0x46, 0xff, 0xfe, 0, 4, 0x6e, 0x6f, 0xff, 0xd9])
    const cleaned = stripImageMetadata(jpeg, 'image/jpeg')
    expect(cleaned).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  })

  it('removes SVG metadata blocks and comments without touching the drawing', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><metadata>GPS</metadata><!-- private --><rect width="1" height="1"/></svg>')
    const cleaned = stripImageMetadata(svg, 'image/svg+xml').toString('utf8')
    expect(cleaned).toContain('<rect width="1" height="1"/>')
    expect(cleaned).not.toContain('GPS')
    expect(cleaned).not.toContain('private')
  })

  it('removes WebP EXIF/XMP chunks and updates the RIFF size', () => {
    const chunk = (type: string, payload: string): Buffer => {
      const bytes = Buffer.from(payload)
      const header = Buffer.alloc(8)
      header.write(type, 0, 4, 'ascii')
      header.writeUInt32LE(bytes.length, 4)
      return Buffer.concat([header, bytes, bytes.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)])
    }
    const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'ascii'), chunk('EXIF', 'private'), chunk('VP8 ', 'pixels')])
    webp.writeUInt32LE(webp.length - 8, 4)
    const cleaned = stripImageMetadata(webp, 'image/webp')
    expect(cleaned.toString('ascii', 0, 4)).toBe('RIFF')
    expect(cleaned.toString('ascii')).not.toContain('EXIF')
    expect(cleaned.toString('ascii')).toContain('VP8 ')
    expect(cleaned.readUInt32LE(4)).toBe(cleaned.length - 8)
  })

  it('preserves malformed or unsupported inputs instead of corrupting exports', () => {
    const malformed = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 20])
    expect(stripImageMetadata(malformed, 'image/png')).toEqual(malformed)
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 10, 1])
    expect(stripImageMetadata(jpeg, 'image/jpeg')).toEqual(jpeg)
    const svg = Buffer.from('<not-svg>private</not-svg>')
    expect(stripImageMetadata(svg, 'image/svg+xml')).toEqual(svg)
    const unknown = Buffer.from('private')
    expect(stripImageMetadata(unknown, 'image/avif')).toEqual(unknown)
  })
})
