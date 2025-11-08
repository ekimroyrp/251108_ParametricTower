import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import GUI from 'lil-gui'

type EasingMode = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'

const easingFns: Record<EasingMode, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => {
    if (t < 0.5) {
      return 2 * t * t
    }
    return 1 - Math.pow(-2 * t + 2, 2) / 2
  },
}

type TowerParams = {
  floors: number
  floorHeight: number
  slabThickness: number
  baseRadius: number
  segments: number
  twistMin: number
  twistMax: number
  twistEase: EasingMode
  scaleMin: number
  scaleMax: number
  scaleEase: EasingMode
  colorBottom: string
  colorTop: string
  autoSpin: boolean
  spinSpeed: number
}

const params: TowerParams = {
  floors: 48,
  floorHeight: 3,
  slabThickness: 0.35,
  baseRadius: 6,
  segments: 4,
  twistMin: -45,
  twistMax: 240,
  twistEase: 'easeInOut',
  scaleMin: 0.65,
  scaleMax: 1.2,
  scaleEase: 'easeOut',
  colorBottom: '#ff0000',
  colorTop: '#2b00ff',
  autoSpin: false,
  spinSpeed: 15,
}

type LightingPresetName =
  | 'Neutral Day'
  | 'Studio Cool'
  | 'Sunset Warm'
  | 'Night Neon'
  | 'High Contrast'

type LightingPreset = {
  ambient: { color: string; intensity: number }
  hemisphere: { skyColor: string; groundColor: string; intensity: number }
  key: { color: string; intensity: number; position: [number, number, number] }
  fill: { color: string; intensity: number; position: [number, number, number] }
  background: string
  exposure: number
}

type SavedState = {
  name: string
  params: TowerParams
  graphEnabled: boolean
  graphPoints: [Vec2, Vec2]
  lighting: LightingPresetName
}

type GuiController = ReturnType<GUI['add']>
type ControllerMap = Partial<Record<keyof TowerParams, GuiController>>
type Vec2 = { x: number; y: number }

const savedStates: SavedState[] = []
const controllerMap: ControllerMap = {}
const stateSelector = { selected: 'Select State' }
let stateController: GuiController | null = null
let scaleGraphToggleController: GuiController | null = null
let overlayResizeListenerAttached = false
let lightingController: GuiController | null = null
const lightingState = { selected: 'Neutral Day' as LightingPresetName }

const scaleGraphState = {
  enabled: false,
  points: [
    { x: 0.3, y: 0.1 },
    { x: 0.7, y: 0.9 },
  ] as [Vec2, Vec2],
}

type GraphOverlayRefs = {
  container: HTMLDivElement | null
  canvas: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null
  draggingHandle: number | null
  draggingOverlay: boolean
  overlayOffset: Vec2
  position: Vec2
}

const graphOverlay: GraphOverlayRefs = {
  container: null,
  canvas: null,
  ctx: null,
  draggingHandle: null,
  draggingOverlay: false,
  overlayOffset: { x: 0, y: 0 },
  position: { x: 16, y: 16 },
}

let scaleBezierEase = createCubicBezierEasing(
  scaleGraphState.points[0],
  scaleGraphState.points[1],
)

const lightingPresets: Record<LightingPresetName, LightingPreset> = {
  'Neutral Day': {
    ambient: { color: '#f5f8ff', intensity: 0.55 },
    hemisphere: { skyColor: '#f4f6ff', groundColor: '#0a0d16', intensity: 0.85 },
    key: { color: '#ffffff', intensity: 1.35, position: [40, 60, 25] },
    fill: { color: '#8ad7ff', intensity: 0.95, position: [-35, 30, -10] },
    background: '#0a1020',
    exposure: 1.15,
  },
  'Studio Cool': {
    ambient: { color: '#d0ddff', intensity: 0.3 },
    hemisphere: { skyColor: '#b8d9ff', groundColor: '#0c1222', intensity: 0.7 },
    key: { color: '#dff1ff', intensity: 1.6, position: [25, 70, 35] },
    fill: { color: '#6ab0ff', intensity: 1.1, position: [-50, 25, -5] },
    background: '#050814',
    exposure: 1.3,
  },
  'Sunset Warm': {
    ambient: { color: '#ffc9a3', intensity: 0.45 },
    hemisphere: { skyColor: '#ffb48d', groundColor: '#1b0b10', intensity: 0.6 },
    key: { color: '#ffcf96', intensity: 1.7, position: [55, 45, 5] },
    fill: { color: '#ff7b6e', intensity: 0.8, position: [-25, 15, -25] },
    background: '#2b0d12',
    exposure: 1.05,
  },
  'Night Neon': {
    ambient: { color: '#4bb4ff', intensity: 0.25 },
    hemisphere: { skyColor: '#0c2449', groundColor: '#010104', intensity: 0.9 },
    key: { color: '#83f4ff', intensity: 1, position: [35, 30, 35] },
    fill: { color: '#ff4bbd', intensity: 0.85, position: [-30, 40, -20] },
    background: '#05040f',
    exposure: 1.4,
  },
  'High Contrast': {
    ambient: { color: '#fbfbfb', intensity: 0.2 },
    hemisphere: { skyColor: '#ffffff', groundColor: '#050505', intensity: 0.45 },
    key: { color: '#ffffff', intensity: 1.9, position: [60, 80, 40] },
    fill: { color: '#1c2538', intensity: 0.4, position: [-45, 20, -35] },
    background: '#0a0a0a',
    exposure: 1.25,
  },
}

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) {
  throw new Error('Unable to find #app container')
}

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.15
appRoot.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#0a1020')

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
camera.position.set(20, 25, 30)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI * 0.495

const ambientLight = new THREE.AmbientLight(0xf5f8ff, 0.55)
scene.add(ambientLight)

const hemiLight = new THREE.HemisphereLight(0xf4f6ff, 0x0a0d16, 0.85)
hemiLight.position.set(0, 80, 0)
scene.add(hemiLight)

const keyLight = new THREE.DirectionalLight(0xffffff, 1.35)
keyLight.position.set(40, 60, 25)
keyLight.castShadow = true
scene.add(keyLight)

const fillLight = new THREE.DirectionalLight(0x8ad7ff, 0.95)
fillLight.position.set(-35, 30, -10)
scene.add(fillLight)

const setLightingPreset = (
  name: LightingPresetName,
  options?: { fromController?: boolean },
) => {
  const preset = lightingPresets[name]
  if (!preset) {
    return
  }
  lightingState.selected = name
  ambientLight.color.set(preset.ambient.color)
  ambientLight.intensity = preset.ambient.intensity
  hemiLight.color.set(preset.hemisphere.skyColor)
  hemiLight.groundColor.set(preset.hemisphere.groundColor)
  hemiLight.intensity = preset.hemisphere.intensity
  keyLight.color.set(preset.key.color)
  keyLight.intensity = preset.key.intensity
  keyLight.position.set(...preset.key.position)
  fillLight.color.set(preset.fill.color)
  fillLight.intensity = preset.fill.intensity
  fillLight.position.set(...preset.fill.position)
  renderer.toneMappingExposure = preset.exposure
  scene.background = new THREE.Color(preset.background)
  if (!options?.fromController) {
    lightingController?.setValue(name)
  }
}

setLightingPreset(lightingState.selected, { fromController: true })

const createInfiniteGrid = (
  color = '#c7ccd6',
  minorStep = 1,
  majorStep = 5,
  fadeDistance = 600,
) => {
  const geometry = new THREE.PlaneGeometry(2, 2, 1, 1)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uMinorStep: { value: minorStep },
      uMajorStep: { value: majorStep },
      uFadeDistance: { value: fadeDistance },
      uOpacity: { value: 0.5 },
    },
    vertexShader: `
      varying vec3 worldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        worldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      #ifdef GL_OES_standard_derivatives
        #extension GL_OES_standard_derivatives : enable
      #endif
      varying vec3 worldPosition;
      uniform vec3 uColor;
      uniform float uMinorStep;
      uniform float uMajorStep;
      uniform float uFadeDistance;
      uniform float uOpacity;

      float gridFactor(vec2 coord, float stepSize) {
        vec2 cell = abs(fract(coord / stepSize - 0.5) - 0.5) / fwidth(coord / stepSize);
        float line = min(cell.x, cell.y);
        return 1.0 - clamp(line, 0.0, 1.0);
      }

      void main() {
        vec2 coord = worldPosition.xz;
        float minor = gridFactor(coord, uMinorStep);
        float major = gridFactor(coord, uMajorStep);
        float intensity = max(major, minor * 0.35);
        float dist = length(coord);
        float fade = 1.0 - smoothstep(uFadeDistance * 0.35, uFadeDistance, dist);
        float alpha = intensity * fade * uOpacity;
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.scale.setScalar(5000)
  mesh.position.y = 0
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return mesh
}

const infiniteGrid = createInfiniteGrid()
scene.add(infiniteGrid)

const towerGroup = new THREE.Group()
scene.add(towerGroup)

let baseSlabGeometry: THREE.CylinderGeometry | null = null
const slabMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  metalness: 0.05,
  roughness: 0.35,
  envMapIntensity: 0.8,
  side: THREE.DoubleSide,
})

let towerMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null =
  null

const reusableMatrix = new THREE.Matrix4()
const reusablePosition = new THREE.Vector3()
const reusableQuaternion = new THREE.Quaternion()
const reusableScale = new THREE.Vector3()
const axisY = new THREE.Vector3(0, 1, 0)

const buildBaseSlabGeometry = () => {
  const segmentCount = Math.max(3, Math.round(params.segments))
  if (baseSlabGeometry) {
    baseSlabGeometry.dispose()
  }
  baseSlabGeometry = new THREE.CylinderGeometry(1, 1, 1, segmentCount, 1, false)
}

const ensureTowerMesh = () => {
  if (!towerMesh) {
    towerMesh = new THREE.Mesh(new THREE.BufferGeometry(), slabMaterial)
    towerMesh.castShadow = true
    towerMesh.receiveShadow = true
    towerGroup.add(towerMesh)
  }
}

const lerp = (start: number, end: number, alpha: number) =>
  start + (end - start) * alpha

const formatFloat = (value: number) => Number.parseFloat(value.toFixed(6)).toString()

const downloadTextFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

const GRAPH_CANVAS_SIZE = 260

const drawScaleGraph = () => {
  if (!graphOverlay.canvas || !graphOverlay.ctx) {
    return
  }
  const { canvas, ctx } = graphOverlay
  const size = canvas.width
  ctx.clearRect(0, 0, size, size)

  const gradient = ctx.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, '#eef0f7')
  gradient.addColorStop(1, '#d6dae6')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const gridStep = size / 8
  ctx.strokeStyle = '#cad0e0'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= size; i += gridStep) {
    ctx.moveTo(0, i)
    ctx.lineTo(size, i)
  }
  for (let i = 0; i <= size; i += gridStep) {
    ctx.moveTo(i, 0)
    ctx.lineTo(i, size)
  }
  ctx.stroke()

  const p1 = scaleGraphState.points[0]
  const p2 = scaleGraphState.points[1]

  const toCanvas = (point: Vec2) => ({
    x: point.x * size,
    y: (1 - point.y) * size,
  })

  const start = { x: 0, y: size }
  const end = { x: size, y: 0 }
  const c1 = toCanvas(p1)
  const c2 = toCanvas(p2)

  ctx.strokeStyle = '#b43131'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(c1.x, c1.y)
  ctx.moveTo(end.x, end.y)
  ctx.lineTo(c2.x, c2.y)
  ctx.stroke()

  ctx.strokeStyle = '#111'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60
    const point = cubicBezierPoint(t, p1, p2)
    const canvasPoint = toCanvas(point)
    ctx.lineTo(canvasPoint.x, canvasPoint.y)
  }
  ctx.lineTo(end.x, end.y)
  ctx.stroke()

  const drawHandle = (point: { x: number; y: number }, isEndpoint = false) => {
    ctx.fillStyle = isEndpoint ? '#111' : '#fff'
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(point.x, point.y, isEndpoint ? 6 : 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  drawHandle(start, true)
  drawHandle(end, true)
  drawHandle(c1)
  drawHandle(c2)
}

const setOverlayPosition = (x: number, y: number) => {
  if (!graphOverlay.container) {
    return
  }
  const padding = 16
  const maxX = Math.max(
    padding,
    window.innerWidth - graphOverlay.container.offsetWidth - padding,
  )
  const maxY = Math.max(
    padding,
    window.innerHeight - graphOverlay.container.offsetHeight - padding,
  )
  const clampedX = THREE.MathUtils.clamp(x, padding, maxX)
  const clampedY = THREE.MathUtils.clamp(y, padding, maxY)
  graphOverlay.position = { x: clampedX, y: clampedY }
  graphOverlay.container.style.left = `${clampedX}px`
  graphOverlay.container.style.top = `${clampedY}px`
  graphOverlay.container.style.bottom = 'auto'
}

const initScaleGraphOverlay = () => {
  if (graphOverlay.container) {
    return
  }
  const container = document.createElement('div')
  container.className = 'bezier-overlay hidden'
  const header = document.createElement('div')
  header.className = 'bezier-overlay__header'
  header.textContent = 'Scale Gradient'
  container.appendChild(header)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = GRAPH_CANVAS_SIZE
  canvas.style.touchAction = 'none'
  container.appendChild(canvas)
  appRoot.appendChild(container)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  graphOverlay.container = container
  graphOverlay.canvas = canvas
  graphOverlay.ctx = ctx

  const getNormalizedPoint = (event: PointerEvent) => {
    if (!graphOverlay.canvas) {
      return { x: 0, y: 0 }
    }
    const rect = graphOverlay.canvas.getBoundingClientRect()
    const x = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height, 0, 1)
    return { x, y: 1 - y }
  }

  const handlePointerDown = (event: PointerEvent) => {
    const point = getNormalizedPoint(event)
    const handleRadius = 0.08
    scaleGraphState.points.forEach((p, idx) => {
      const dist = Math.hypot(p.x - point.x, p.y - point.y)
      if (dist < handleRadius) {
        graphOverlay.draggingHandle = idx
      }
    })
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (graphOverlay.draggingHandle === null) {
      return
    }
    const point = getNormalizedPoint(event)
    scaleGraphState.points[graphOverlay.draggingHandle] = {
      x: THREE.MathUtils.clamp(point.x, 0, 1),
      y: THREE.MathUtils.clamp(point.y, 0, 1),
    }
    updateScaleBezierEase()
    drawScaleGraph()
  }

  const handlePointerUp = () => {
    graphOverlay.draggingHandle = null
  }

  canvas.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)

  const handleOverlayPointerDown = (event: PointerEvent) => {
    if (!graphOverlay.container) {
      return
    }
    event.preventDefault()
    const rect = graphOverlay.container.getBoundingClientRect()
    graphOverlay.draggingOverlay = true
    graphOverlay.overlayOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  const handleOverlayPointerMove = (event: PointerEvent) => {
    if (!graphOverlay.draggingOverlay) {
      return
    }
    const x = event.clientX - graphOverlay.overlayOffset.x
    const y = event.clientY - graphOverlay.overlayOffset.y
    setOverlayPosition(x, y)
  }

  const handleOverlayPointerUp = () => {
    graphOverlay.draggingOverlay = false
  }

  header.addEventListener('pointerdown', handleOverlayPointerDown)
  window.addEventListener('pointermove', handleOverlayPointerMove)
  window.addEventListener('pointerup', handleOverlayPointerUp)

  const applyInitialPosition = () => {
    const defaultY =
      window.innerHeight -
      (graphOverlay.container?.offsetHeight ?? 0) -
      16
    setOverlayPosition(graphOverlay.position.x, defaultY)
  }
  requestAnimationFrame(applyInitialPosition)

  if (!overlayResizeListenerAttached) {
    window.addEventListener('resize', () => {
      if (graphOverlay.container) {
        setOverlayPosition(graphOverlay.position.x, graphOverlay.position.y)
      }
    })
    overlayResizeListenerAttached = true
  }

  drawScaleGraph()
}

const toggleScaleGraphOverlay = (show: boolean) => {
  initScaleGraphOverlay()
  if (!graphOverlay.container) {
    return
  }
  graphOverlay.container.classList.toggle('hidden', !show)
  graphOverlay.container.classList.toggle('visible', show)
  if (show) {
    drawScaleGraph()
  }
}

const updateScaleBezierEase = (triggerUpdate = true) => {
  scaleBezierEase = createCubicBezierEasing(
    scaleGraphState.points[0],
    scaleGraphState.points[1],
  )
  if (triggerUpdate && scaleGraphState.enabled) {
    updateTowerGeometry()
  }
}

const applyScaleGraphToggle = (enabled: boolean, skipUpdate = false) => {
  scaleGraphState.enabled = enabled
  toggleScaleGraphOverlay(enabled)
  if (!enabled) {
    graphOverlay.draggingHandle = null
  }
  if (controllerMap.scaleEase) {
    if (enabled) {
      controllerMap.scaleEase.disable()
    } else {
      controllerMap.scaleEase.enable()
    }
  }
  if (!skipUpdate) {
    updateTowerGeometry()
  }
}

const refreshGuiControllers = () => {
  Object.values(controllerMap).forEach((controller) => {
    if (controller) {
      controller.updateDisplay()
    }
  })
  scaleGraphToggleController?.updateDisplay()
}

function cubicBezierPoint(t: number, p1: Vec2, p2: Vec2): Vec2 {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t
  return {
    x: uuu * 0 + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * 1,
    y: uuu * 0 + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * 1,
  }
}

function createCubicBezierEasing(p1: Vec2, p2: Vec2) {
  const cx = 3 * p1.x
  const bx = 3 * (p2.x - p1.x) - cx
  const ax = 1 - cx - bx

  const cy = 3 * p1.y
  const by = 3 * (p2.y - p1.y) - cy
  const ay = 1 - cy - by

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t
  const sampleDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx

  const solveCurveX = (x: number, epsilon = 1e-5) => {
    let t = x
    for (let i = 0; i < 8; i += 1) {
      const xValue = sampleCurveX(t) - x
      if (Math.abs(xValue) < epsilon) {
        return t
      }
      const d = sampleDerivativeX(t)
      if (Math.abs(d) < 1e-6) {
        break
      }
      t -= xValue / d
    }
    let t0 = 0
    let t1 = 1
    t = x
    while (t0 < t1) {
      const xValue = sampleCurveX(t)
      if (Math.abs(xValue - x) < epsilon) {
        return t
      }
      if (x > xValue) {
        t0 = t
      } else {
        t1 = t
      }
      t = (t1 + t0) / 2
    }
    return t
  }

  return (x: number) => {
    if (p1.x === p2.x && p1.y === p2.y) {
      return x
    }
    const t = solveCurveX(THREE.MathUtils.clamp(x, 0, 1))
    return sampleCurveY(t)
  }
}

const updateStateDropdown = (selectedName = 'Select State') => {
  if (!stateController) {
    return
  }
  const options = ['Select State', ...savedStates.map((entry) => entry.name)]
  stateController.options(options)
  stateSelector.selected = selectedName
  stateController.setValue(selectedName)
}

const saveCurrentState = () => {
  const snapshot: TowerParams = { ...params }
  const nextState: SavedState = {
    name: `State ${savedStates.length + 1}`,
    params: snapshot,
    graphEnabled: scaleGraphState.enabled,
    graphPoints: scaleGraphState.points.map((p) => ({ ...p })) as [Vec2, Vec2],
    lighting: lightingState.selected,
  }
  savedStates.push(nextState)
  updateStateDropdown(nextState.name)
}

const loadState = (stateName: string) => {
  if (stateName === 'Select State') {
    return
  }
  const match = savedStates.find((state) => state.name === stateName)
  if (!match) {
    return
  }
  Object.assign(params, match.params)
  scaleGraphState.points = match.graphPoints.map((p) => ({ ...p })) as [Vec2, Vec2]
  initScaleGraphOverlay()
  applyScaleGraphToggle(match.graphEnabled, true)
  if (scaleGraphToggleController) {
    scaleGraphToggleController.updateDisplay()
  }
  drawScaleGraph()
  setLightingPreset(match.lighting)
  buildBaseSlabGeometry()
  updateTowerGeometry()
  refreshGuiControllers()
}

const updateTowerGeometry = () => {
  ensureTowerMesh()
  if (!baseSlabGeometry) {
    buildBaseSlabGeometry()
  }
  if (!towerMesh || !baseSlabGeometry) {
    return
  }

  const bottomColor = new THREE.Color(params.colorBottom)
  const topColor = new THREE.Color(params.colorTop)
  const highlightColor = new THREE.Color('#ffffff')

  const geometries: THREE.BufferGeometry[] = []
  const scaleEaseFn = scaleGraphState.enabled
    ? scaleBezierEase
    : easingFns[params.scaleEase]

  for (let i = 0; i < params.floors; i += 1) {
    const t = params.floors === 1 ? 0 : i / (params.floors - 1)
    const twistT = easingFns[params.twistEase](t)
    const scaleT = scaleEaseFn(t)
    const twist = THREE.MathUtils.degToRad(
      lerp(params.twistMin, params.twistMax, twistT),
    )
    const scaleFactor = lerp(params.scaleMin, params.scaleMax, scaleT)

    reusablePosition.set(0, i * params.floorHeight, 0)
    reusableQuaternion.setFromAxisAngle(axisY, twist)
    reusableScale.set(
      params.baseRadius * scaleFactor,
      params.slabThickness,
      params.baseRadius * scaleFactor,
    )
    reusableMatrix.compose(reusablePosition, reusableQuaternion, reusableScale)

    const slab = baseSlabGeometry.clone()
    slab.applyMatrix4(reusableMatrix)

    const vertexCount = slab.attributes.position.count
    const colors = new Float32Array(vertexCount * 3)
    const gradientColor = bottomColor
      .clone()
      .lerp(topColor, t)
      .lerp(highlightColor, 0.15)

    for (let v = 0; v < vertexCount; v += 1) {
      const offset = v * 3
      colors[offset] = gradientColor.r
      colors[offset + 1] = gradientColor.g
      colors[offset + 2] = gradientColor.b
    }

    slab.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometries.push(slab)
  }

  const merged = mergeGeometries(geometries, true)
  if (!merged) {
    return
  }

  towerMesh.geometry.dispose()
  towerMesh.geometry = merged
  towerMesh.geometry.computeVertexNormals()
}

const exportTowerAsObj = () => {
  updateTowerGeometry()
  if (!towerMesh) {
    return
  }

  const geometry = towerMesh.geometry
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')
  const colors = geometry.getAttribute('color')

  const hasNormals = !!normals
  const hasColors = !!colors

  const lines: string[] = [
    '# Parametric Tower Export',
    `# Vertices: ${positions.count}`,
    `# Faces: ${geometry.index ? geometry.index.count / 3 : positions.count / 3}`,
    'o ParametricTower',
  ]

  for (let i = 0; i < positions.count; i += 1) {
    const x = formatFloat(positions.getX(i))
    const y = formatFloat(positions.getY(i))
    const z = formatFloat(positions.getZ(i))

    if (hasColors) {
      const r = formatFloat(colors.getX(i))
      const g = formatFloat(colors.getY(i))
      const b = formatFloat(colors.getZ(i))
      lines.push(`v ${x} ${y} ${z} ${r} ${g} ${b}`)
    } else {
      lines.push(`v ${x} ${y} ${z}`)
    }
  }

  if (hasNormals && normals) {
    for (let i = 0; i < normals.count; i += 1) {
      const nx = formatFloat(normals.getX(i))
      const ny = formatFloat(normals.getY(i))
      const nz = formatFloat(normals.getZ(i))
      lines.push(`vn ${nx} ${ny} ${nz}`)
    }
  }

  const faceToken = (idx: number) => {
    if (hasNormals) {
      return `${idx}//${idx}`
    }
    return `${idx}`
  }

  const indices = geometry.getIndex()
  if (indices) {
    const indexArray = indices.array
    for (let i = 0; i < indexArray.length; i += 3) {
      const a = indexArray[i] + 1
      const b = indexArray[i + 1] + 1
      const c = indexArray[i + 2] + 1
      lines.push(`f ${faceToken(a)} ${faceToken(b)} ${faceToken(c)}`)
    }
  } else {
    for (let i = 0; i < positions.count; i += 3) {
      const a = i + 1
      const b = i + 2
      const c = i + 3
      lines.push(`f ${faceToken(a)} ${faceToken(b)} ${faceToken(c)}`)
    }
  }

  downloadTextFile(lines.join('\n'), `parametric-tower-${Date.now()}.obj`)
}

const resizeRenderer = () => {
  const { clientWidth, clientHeight } = appRoot
  renderer.setSize(clientWidth, clientHeight, false)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
}

const clock = new THREE.Clock()

const animate = () => {
  requestAnimationFrame(animate)
  const delta = clock.getDelta()
  controls.update()
  if (params.autoSpin) {
    const radiansPerSecond = THREE.MathUtils.degToRad(params.spinSpeed)
    towerGroup.rotation.y += radiansPerSecond * delta
  }
  renderer.render(scene, camera)
}

const initGui = () => {
  const gui = new GUI({ title: 'Tower Controls' })
  gui.domElement.classList.add('tower-gui')

  const structureFolder = gui.addFolder('Structure')
  controllerMap.floors = structureFolder
    .add(params, 'floors', 3, 120, 1)
    .name('Floors')
    .onChange(updateTowerGeometry)
  controllerMap.floorHeight = structureFolder
    .add(params, 'floorHeight', 1, 8, 0.25)
    .name('Floor Height')
    .onChange(updateTowerGeometry)
  controllerMap.slabThickness = structureFolder
    .add(params, 'slabThickness', 0.1, 1, 0.05)
    .name('Slab Thickness')
    .onChange(updateTowerGeometry)
  controllerMap.baseRadius = structureFolder
    .add(params, 'baseRadius', 2, 12, 0.25)
    .name('Base Radius')
    .onChange(updateTowerGeometry)
  controllerMap.segments = structureFolder
    .add(params, 'segments', 3, 30, 1)
    .name('Segments')
    .onChange(() => {
      buildBaseSlabGeometry()
      updateTowerGeometry()
    })

  const twistFolder = gui.addFolder('Twist Gradient')
  controllerMap.twistMin = twistFolder
    .add(params, 'twistMin', -360, 360, 1)
    .name('Min (deg)')
    .onChange(updateTowerGeometry)
  controllerMap.twistMax = twistFolder
    .add(params, 'twistMax', -360, 360, 1)
    .name('Max (deg)')
    .onChange(updateTowerGeometry)
  controllerMap.twistEase = twistFolder
    .add(params, 'twistEase', ['linear', 'easeIn', 'easeOut', 'easeInOut'])
    .name('Ease')
    .onChange(updateTowerGeometry)

  const scaleFolder = gui.addFolder('Scale Gradient')
  controllerMap.scaleMin = scaleFolder
    .add(params, 'scaleMin', 0.3, 1.5, 0.01)
    .name('Min Scale')
    .onChange(updateTowerGeometry)
  controllerMap.scaleMax = scaleFolder
    .add(params, 'scaleMax', 0.3, 10, 0.01)
    .name('Max Scale')
    .onChange(updateTowerGeometry)
  controllerMap.scaleEase = scaleFolder
    .add(params, 'scaleEase', ['linear', 'easeIn', 'easeOut', 'easeInOut'])
    .name('Ease')
    .onChange(updateTowerGeometry)
  scaleGraphToggleController = scaleFolder
    .add(scaleGraphState, 'enabled')
    .name('Use Graph')
    .onChange((value: boolean) => {
      applyScaleGraphToggle(value)
      updateScaleBezierEase(false)
    })

  const colorFolder = gui.addFolder('Gradient Colors')
  controllerMap.colorBottom = colorFolder
    .addColor(params, 'colorBottom')
    .name('Bottom')
    .onChange(updateTowerGeometry)
  controllerMap.colorTop = colorFolder
    .addColor(params, 'colorTop')
    .name('Top')
    .onChange(updateTowerGeometry)
  lightingController = colorFolder
    .add(
      lightingState,
      'selected',
      Object.keys(lightingPresets) as LightingPresetName[],
    )
    .name('Lighting')
    .onChange((value: LightingPresetName) =>
      setLightingPreset(value, { fromController: true }),
    )

  const motionFolder = gui.addFolder('Motion')
  controllerMap.autoSpin = motionFolder.add(params, 'autoSpin').name('Auto Spin')
  controllerMap.spinSpeed = motionFolder
    .add(params, 'spinSpeed', 0, 60, 1)
    .name('Spin deg/s')
    .onChange(() => {
      if (params.spinSpeed <= 0) {
        params.autoSpin = false
      }
    })

  const exportFolder = gui.addFolder('Export')
  const exportActions = {
    saveState: () => saveCurrentState(),
    obj: () => exportTowerAsObj(),
  }
  exportFolder.add(exportActions, 'saveState').name('Save State')
  stateController = exportFolder
    .add(stateSelector, 'selected', ['Select State'])
    .name('Select State')
    .onChange((value: string) => loadState(value))
  exportFolder.add(exportActions, 'obj').name('obj')

  structureFolder.open()
  twistFolder.open()
  scaleFolder.open()
}

window.addEventListener('resize', resizeRenderer)

resizeRenderer()
updateTowerGeometry()
initGui()
animate()
