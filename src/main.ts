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

type SavedState = {
  name: string
  params: TowerParams
}

type GuiController = ReturnType<GUI['add']>
type ControllerMap = Partial<Record<keyof TowerParams, GuiController>>

const savedStates: SavedState[] = []
const controllerMap: ControllerMap = {}
const stateSelector = { selected: 'Select State' }
let stateController: GuiController | null = null

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

const refreshGuiControllers = () => {
  Object.values(controllerMap).forEach((controller) => {
    if (controller) {
      controller.updateDisplay()
    }
  })
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

  for (let i = 0; i < params.floors; i += 1) {
    const t = params.floors === 1 ? 0 : i / (params.floors - 1)
    const twistT = easingFns[params.twistEase](t)
    const scaleT = easingFns[params.scaleEase](t)
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

  const colorFolder = gui.addFolder('Gradient Colors')
  controllerMap.colorBottom = colorFolder
    .addColor(params, 'colorBottom')
    .name('Bottom')
    .onChange(updateTowerGeometry)
  controllerMap.colorTop = colorFolder
    .addColor(params, 'colorTop')
    .name('Top')
    .onChange(updateTowerGeometry)

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
