import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
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
appRoot.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#04060b')

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
camera.position.set(20, 25, 30)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI * 0.495

const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
scene.add(ambientLight)

const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
keyLight.position.set(25, 40, 10)
scene.add(keyLight)

const fillLight = new THREE.DirectionalLight(0x7ec8ff, 0.6)
fillLight.position.set(-30, 10, -20)
scene.add(fillLight)

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 64),
  new THREE.MeshStandardMaterial({
    color: '#0f1928',
    metalness: 0,
    roughness: 0.85,
  }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const towerGroup = new THREE.Group()
scene.add(towerGroup)

const slabGeometry = new THREE.CylinderGeometry(1, 1, 1, 64, 1, false)
const slabMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  metalness: 0.2,
  roughness: 0.45,
  side: THREE.DoubleSide,
})

let towerMesh: THREE.InstancedMesh<
  THREE.CylinderGeometry,
  THREE.MeshStandardMaterial
> | null = null

const reusableMatrix = new THREE.Matrix4()
const reusablePosition = new THREE.Vector3()
const reusableQuaternion = new THREE.Quaternion()
const reusableScale = new THREE.Vector3()
const axisY = new THREE.Vector3(0, 1, 0)

const ensureTowerMesh = () => {
  if (!towerMesh || towerMesh.count !== params.floors) {
    if (towerMesh) {
      towerGroup.remove(towerMesh)
    }
    towerMesh = new THREE.InstancedMesh(
      slabGeometry,
      slabMaterial,
      Math.max(1, params.floors),
    )
    towerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    towerGroup.add(towerMesh)
  }
}

const lerp = (start: number, end: number, alpha: number) =>
  start + (end - start) * alpha

const updateTowerGeometry = () => {
  ensureTowerMesh()
  if (!towerMesh) {
    return
  }

  const bottomColor = new THREE.Color(params.colorBottom)
  const topColor = new THREE.Color(params.colorTop)

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
    towerMesh.setMatrixAt(i, reusableMatrix)

    const slabColor = bottomColor.clone().lerp(topColor, t)
    towerMesh.setColorAt(i, slabColor)
  }

  towerMesh.instanceMatrix.needsUpdate = true
  if (towerMesh.instanceColor) {
    towerMesh.instanceColor.needsUpdate = true
  }
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
