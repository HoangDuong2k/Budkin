import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Quality } from '../../../shared/types'
import { hud } from './hudRefs'
import { Lamp } from './Lamp'
import { Lighting } from './Lighting'
import { projectPoint } from './math/framing'
import { CAMERA } from './math/layout'
import { Monitor } from './Monitor'
import { Props } from './Props'
import { markFrame, type FrameDriver } from './renderLoop'
import { RobotStage } from './robots/RobotStage'
import { Room } from './Room'
import { useSceneDriver } from './sceneDriver'
import { stage } from './stage'
import { ThemeDirector } from './ThemeDirector'
import { Vignette } from './Vignette'

function place(el: HTMLElement | null, world: { x: number; y: number; z: number }, w: number, h: number): void {
  if (!el) return
  const p = projectPoint(world, stage.camera, CAMERA, stage.viewport)
  el.style.transform = `translate(${Math.round(p.x - w / 2)}px, ${Math.round(p.y - h / 2)}px)`
  el.style.width = `${w}px`
  el.style.height = `${h}px`
}

/** Điều phối vòng vẽ (sceneDriver): đếm khung, đặt nút ẩn cho đèn / robot lên đúng chỗ trên cảnh */
function Driver({ quality, software }: { quality: Quality; software: boolean }): null {
  const get = useThree((s) => s.get)
  const driver = useMemo<FrameDriver>(
    () => ({ invalidate: () => get().invalidate(), setRunning: (running) => get().setFrameloop(running ? 'demand' : 'never') }),
    [get]
  )
  useSceneDriver(driver, quality, software)

  useFrame(() => {
    markFrame()
    const l = stage.layout
    place(hud.lampButton, { x: l.lamp.x - 0.02, y: 0.25, z: l.lamp.z }, 64, 150)
    place(hud.robotButton, { x: l.robot.x, y: 0.12, z: l.robot.z }, 70, 90)
    place(hud.pedestalButton, { x: l.robot.x, y: 0.008, z: l.robot.z }, 96, 26)
  }, -20)
  return null
}

export function World({ quality, software }: { quality: Quality; software: boolean }): React.JSX.Element {
  return (
    <>
      <Driver quality={quality} software={software} />
      <ThemeDirector />
      <Lighting />
      <Room />
      <Monitor />
      <Props />
      <Lamp />
      <RobotStage />
      <Vignette />
    </>
  )
}
