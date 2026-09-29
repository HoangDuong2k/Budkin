import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { projectPlaneRect, snapOutward, solveCameraPosition, type Vec3 } from '../src/renderer/src/scene/math/framing'
import { BEZEL, CAMERA, LAMP_BOX, MARGINS, ROBOT_BOX, cameraFor, sceneLayout, type Box } from '../src/renderer/src/scene/math/layout'

/** Camera three.js thật dựng từ lời giải — dùng làm "đáp án" cho các công thức đóng */
function threeCamera(pos: Vec3, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(CAMERA.fovY), aspect, 0.05, 30)
  cam.position.set(pos.x, pos.y, pos.z)
  cam.rotation.set(-CAMERA.pitch, 0, 0)
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
  return cam
}

function ndc(p: Vec3, cam: THREE.Camera): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z).project(cam)
}

/** Điểm (CSS px) mà three.js chiếu ra */
function toPx(p: Vec3, cam: THREE.Camera, w: number, h: number): { x: number; y: number } {
  const v = ndc(p, cam)
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }
}

/** Góc màn hình (thế giới): đầu màn hình xoay Rx(−pitch) quanh tâm */
function screenCorners(center: Vec3, w: number, h: number): Vec3[] {
  const c = Math.cos(CAMERA.pitch)
  const s = Math.sin(CAMERA.pitch)
  return [
    [-w / 2, h / 2],
    [w / 2, h / 2],
    [-w / 2, -h / 2],
    [w / 2, -h / 2]
  ].map(([x, y]) => ({ x: center.x + x, y: center.y + y * c, z: center.z - y * s }))
}

const VIEWPORTS: Array<[number, number]> = [
  [1024, 680],
  [1000, 660],
  [1280, 820],
  [1366, 720],
  [1600, 900],
  [1920, 1040],
  [2560, 1080],
  [1024, 900]
]

describe('khung hình camera cố định', () => {
  it('mọi điểm mốc nằm trong khung, chiều bị giới hạn được lấp khít', () => {
    for (const [w, h] of VIEWPORTS) {
      const aspect = w / h
      const layout = sceneLayout(aspect)
      const cam = threeCamera(cameraFor(layout, aspect), aspect)
      const pts = layout.keyPoints.map((p) => ndc(p, cam))
      const maxX = Math.max(...pts.map((p) => Math.abs(p.x)))
      const maxY = Math.max(...pts.map((p) => Math.abs(p.y)))
      expect(maxX, `${w}x${h}`).toBeLessThanOrEqual(MARGINS.x + 1e-9)
      expect(maxY, `${w}x${h}`).toBeLessThanOrEqual(MARGINS.y + 1e-9)
      // Một trong hai chiều chạm đúng lề
      expect(Math.max(maxX / MARGINS.x, maxY / MARGINS.y), `${w}x${h}`).toBeCloseTo(1, 9)
    }
  })

  it('lời giải tổng quát: điểm ngẫu nhiên, góc chúc khác nhau', () => {
    let seed = 7
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
    for (let k = 0; k < 20; k++) {
      const pitch = Math.abs(rnd()) * 0.5
      const spec = { pitch, fovY: CAMERA.fovY }
      const aspect = 1 + Math.abs(rnd()) * 1.5
      const points = Array.from({ length: 12 }, () => ({ x: rnd(), y: rnd(), z: rnd() * 0.5 }))
      const pos = solveCameraPosition(points, spec, aspect, { x: 0.9, y: 0.9 })
      const cam = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(spec.fovY), aspect, 0.01, 100)
      cam.position.set(pos.x, pos.y, pos.z)
      cam.rotation.set(-pitch, 0, 0)
      cam.updateMatrixWorld()
      const pts = points.map((p) => ndc(p, cam))
      expect(Math.max(...pts.map((p) => Math.abs(p.x)))).toBeLessThanOrEqual(0.9 + 1e-9)
      expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeLessThanOrEqual(0.9 + 1e-9)
      for (const p of pts) expect(p.z).toBeLessThan(1)
    }
  })

  it('màn hình chiếu ra đúng một hình chữ nhật thẳng, khớp công thức đóng', () => {
    for (const [w, h] of VIEWPORTS) {
      const aspect = w / h
      const layout = sceneLayout(aspect)
      const pos = cameraFor(layout, aspect)
      const cam = threeCamera(pos, aspect)
      const [tl, tr, bl, br] = screenCorners(layout.screenCenter, layout.screenW, layout.screenH).map((p) => toPx(p, cam, w, h))
      expect(tl.y).toBeCloseTo(tr.y, 6)
      expect(bl.y).toBeCloseTo(br.y, 6)
      expect(tl.x).toBeCloseTo(bl.x, 6)
      expect(tr.x).toBeCloseTo(br.x, 6)
      const rect = projectPlaneRect(layout.screenCenter, { width: layout.screenW, height: layout.screenH }, pos, CAMERA, { width: w, height: h })
      expect(rect.x).toBeCloseTo(tl.x, 6)
      expect(rect.y).toBeCloseTo(tl.y, 6)
      expect(rect.x + rect.width).toBeCloseTo(br.x, 6)
      expect(rect.y + rect.height).toBeCloseTo(br.y, 6)
    }
  })

  it('màn hình chiếm 52–62% bề ngang ở các tỉ lệ cửa sổ thường gặp', () => {
    for (const [w, h] of VIEWPORTS.filter(([w, h]) => w / h >= 1.45 && w / h <= 2.05)) {
      const layout = sceneLayout(w / h)
      const rect = projectPlaneRect(layout.screenCenter, { width: layout.screenW, height: layout.screenH }, cameraFor(layout, w / h), CAMERA, { width: w, height: h })
      expect(rect.width / w, `${w}x${h}`).toBeGreaterThanOrEqual(0.52)
      expect(rect.width / w, `${w}x${h}`).toBeLessThanOrEqual(0.62)
    }
  })

  it('phần robot và đèn đứng trước màn hình không bao giờ lấn vào vùng giao diện (lớp DOM sẽ che mất)', () => {
    // Phần nằm sau mặt phẳng màn hình thì chính màn hình 3D đã che, lấn vào vùng giao diện cũng không sao
    const samples = (b: Box, at: Vec3): Vec3[] => {
      const out: Vec3[] = []
      const n = 8
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= n; j++)
          for (let k = 0; k <= n; k++)
            out.push({
              x: at.x + b.min.x + ((b.max.x - b.min.x) * i) / n,
              y: at.y + b.min.y + ((b.max.y - b.min.y) * j) / n,
              z: at.z + b.min.z + ((b.max.z - b.min.z) * k) / n
            })
      return out
    }
    for (let aspect = 1.1; aspect <= 2.5; aspect += 0.05) {
      const w = 1000 * aspect
      const h = 1000
      const layout = sceneLayout(aspect)
      const pos = cameraFor(layout, aspect)
      const cam = threeCamera(pos, aspect)
      const depth = (p: Vec3): number => -new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(cam.matrixWorldInverse).z
      const screenDepth = depth(layout.screenCenter)
      const rect = projectPlaneRect(layout.screenCenter, { width: layout.screenW, height: layout.screenH }, pos, CAMERA, { width: w, height: h })
      const inFront = (p: Vec3): boolean => depth(p) <= screenDepth
      const robotRight = Math.max(...samples(ROBOT_BOX, layout.robot).filter(inFront).map((p) => toPx(p, cam, w, h).x))
      const lampLeft = Math.min(...samples(LAMP_BOX, layout.lamp).filter(inFront).map((p) => toPx(p, cam, w, h).x))
      expect(robotRight, `aspect ${aspect.toFixed(2)}`).toBeLessThan(rect.x)
      expect(lampLeft, `aspect ${aspect.toFixed(2)}`).toBeGreaterThan(rect.x + rect.width)
      // Cả khối (kể cả phần sau) vẫn nằm ngoài phần màn hình tính cả viền theo bề ngang thế giới
      expect(layout.robot.x + ROBOT_BOX.max.x).toBeLessThan(-(layout.screenW / 2 + BEZEL))
      expect(layout.lamp.x + LAMP_BOX.min.x).toBeGreaterThan(layout.screenW / 2 + BEZEL)
    }
  })
})

describe('làm tròn ra ngoài theo pixel thật', () => {
  it('phủ kín hình chữ nhật gốc và nằm trên lưới điểm ảnh', () => {
    const r = { x: 237.37, y: 61.02, width: 552.61, height: 364.4 }
    for (const dpr of [1, 1.25, 1.5, 2]) {
      const s = snapOutward(r, dpr)
      expect(s.x).toBeLessThanOrEqual(r.x)
      expect(s.y).toBeLessThanOrEqual(r.y)
      expect(s.x + s.width).toBeGreaterThanOrEqual(r.x + r.width - 1e-9)
      expect(s.y + s.height).toBeGreaterThanOrEqual(r.y + r.height - 1e-9)
      for (const v of [s.x, s.y, s.x + s.width, s.y + s.height]) expect(Math.abs(v * dpr - Math.round(v * dpr))).toBeLessThan(1e-6)
      // Lớn hơn gốc chưa tới 1 pixel thật mỗi cạnh
      expect(r.x - s.x).toBeLessThan(1 / dpr)
      expect(s.x + s.width - (r.x + r.width)).toBeLessThan(1 / dpr)
    }
  })

  it('đã nằm trên lưới thì giữ nguyên', () => {
    // 1.25: lưới điểm ảnh thật là bội của 0.8 px CSS
    expect(snapOutward({ x: 8, y: 20, width: 320, height: 200 }, 1.25)).toEqual({ x: 8, y: 20, width: 320, height: 200 })
    expect(snapOutward({ x: 10, y: 20, width: 300, height: 200 }, 1)).toEqual({ x: 10, y: 20, width: 300, height: 200 })
  })
})
