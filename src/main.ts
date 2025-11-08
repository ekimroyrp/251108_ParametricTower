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
  segments: 48,
  twistMin: -45,
  twistMax: 240,
  twistEase: 'easeInOut',
  scaleMin: 0.65,
  scaleMax: 1.2,
  scaleEase: 'easeOut',
  colorBottom: '#083358',
  colorTop: '#f7f08c',
  autoSpin: true,
  spinSpeed: 15,
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

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 64),
  new THREE.MeshStandardMaterial({
    color: '#15223c',
    metalness: 0.1,
    roughness: 0.7,
  }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

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
  structureFolder
    .add(params, 'floors', 3, 120, 1)
    .name('Floors')
    .onChange(updateTowerGeometry)
  structureFolder
    .add(params, 'floorHeight', 1, 8, 0.25)
    .name('Floor Height')
    .onChange(updateTowerGeometry)
  structureFolder
    .add(params, 'slabThickness', 0.1, 1, 0.05)
    .name('Slab Thickness')
    .onChange(updateTowerGeometry)
  structureFolder
    .add(params, 'baseRadius', 2, 12, 0.25)
    .name('Base Radius')
    .onChange(updateTowerGeometry)
  structureFolder
    .add(params, 'segments', 3, 128, 1)
    .name('Segments')
    .onChange(() => {
      buildBaseSlabGeometry()
      updateTowerGeometry()
    })

  const twistFolder = gui.addFolder('Twist Gradient')
  twistFolder
    .add(params, 'twistMin', -360, 360, 1)
    .name('Min (deg)')
    .onChange(updateTowerGeometry)
  twistFolder
    .add(params, 'twistMax', -360, 360, 1)
    .name('Max (deg)')
    .onChange(updateTowerGeometry)
  twistFolder
    .add(params, 'twistEase', ['linear', 'easeIn', 'easeOut', 'easeInOut'])
    .name('Ease')
    .onChange(updateTowerGeometry)

  const scaleFolder = gui.addFolder('Scale Gradient')
  scaleFolder
    .add(params, 'scaleMin', 0.3, 1.5, 0.01)
    .name('Min Scale')
    .onChange(updateTowerGeometry)
  scaleFolder
    .add(params, 'scaleMax', 0.3, 1.5, 0.01)
    .name('Max Scale')
    .onChange(updateTowerGeometry)
  scaleFolder
    .add(params, 'scaleEase', ['linear', 'easeIn', 'easeOut', 'easeInOut'])
    .name('Ease')
    .onChange(updateTowerGeometry)

  const colorFolder = gui.addFolder('Gradient Colors')
  colorFolder
    .addColor(params, 'colorBottom')
    .name('Bottom')
    .onChange(updateTowerGeometry)
  colorFolder
    .addColor(params, 'colorTop')
    .name('Top')
    .onChange(updateTowerGeometry)

  const motionFolder = gui.addFolder('Motion')
  motionFolder.add(params, 'autoSpin').name('Auto Spin')
  motionFolder
    .add(params, 'spinSpeed', 0, 60, 1)
    .name('Spin deg/s')
    .onChange(() => {
      if (params.spinSpeed <= 0) {
        params.autoSpin = false
      }
    })

  structureFolder.open()
  twistFolder.open()
  scaleFolder.open()
}

const buildHud = () => {
  const hud = document.createElement('section')
  hud.className = 'hud'
  hud.innerHTML = `
    <h1>251108_ParametricTower</h1>
    <p>Use the sliders to sculpt floor count, twisting, scaling, and colors. Orbit with your mouse to inspect the tower.</p>
    <ul>
      <li><span>Left mouse</span> orbit</li>
      <li><span>Right mouse</span> pan</li>
      <li><span>Scroll</span> zoom</li>
    </ul>
  `
  appRoot.appendChild(hud)
}

window.addEventListener('resize', resizeRenderer)

buildHud()
resizeRenderer()
updateTowerGeometry()
initGui()
animate()
