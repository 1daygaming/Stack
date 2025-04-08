import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.170.0/three.module.min.js';
import { gsap } from 'https://cdn.skypack.dev/gsap';

/* ==========================
  Настройки игры
  ========================== */

/** Размеры блоков */
const BASE_BLOCK_SIZE = {
  width: 10,
  height: 3,
  depth: 10,
};

const COLOR = {
  background: '#eee',
  baseBlock: '#444',
  movingBlock: '#f753e6',
  placedBlock: '#71ec38',
  fallingBlock: '#f8f659',
};

/** Скорость движения блоков */
const SPEED_FACTOR = 10;

/** Максимальное отклонение блока от центра */
const MOVING_RANGE = 15;


/* ==========================
  Блок башни
  ========================== */

class BlockModel {
  constructor({
    width,
    height = BASE_BLOCK_SIZE.height,
    depth,
    initPosition = new THREE.Vector3(0, 0, 0),
    color = COLOR.movingBlock,
  }) {
    this.width = width;
    this.height = height;
    this.depth = depth;

    this.geometry = new THREE.BoxGeometry(this.width, this.height, this.depth);
    this.material = new THREE.MeshLambertMaterial({ color });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.set(...initPosition);
  }
}


/* ==========================
  Падающий в бездну блок
  ========================== */

/** Рассчитывает размеры и координаты блока, который весь падает вниз */
const getLastBlockProps = (layer) => {
  return {
    width: layer.movingBlock.width,
    depth: layer.movingBlock.depth,
    initPosition: layer.movingBlock.mesh.position,
  };
}

/** Рассчитывает координаты по оси движения */
const calcFallingPosition = (layer, axisPosition) => {
  const shift = axisPosition + layer.overlap / 2;

  return layer.isCuttingBehind ? shift - layer.overlap : shift;
};

/** Рассчитывает размеры и координаты той части блока, которая отрезается и падает вниз */
const getFallingBlockProps = (layer) => {
  const props = {
    width: layer.isAxisX
      ? layer.movingBlock.width - layer.overlap
      : layer.movingBlock.width,
    depth: layer.isAxisZ
        ? layer.movingBlock.depth - layer.overlap
        : layer.movingBlock.depth,
  };

  const x = layer.isAxisX
    ? calcFallingPosition(layer, layer.movingBlock.mesh.position.x)
    : layer.movingBlock.mesh.position.x;

  const z = layer.isAxisZ
    ? calcFallingPosition(layer, layer.movingBlock.mesh.position.z)
    : layer.movingBlock.mesh.position.z;

  props.initPosition = new THREE.Vector3(
    x,
    layer.movingBlock.mesh.position.y,
    z
  );

  return props;
};

class FallingBlockModel extends BlockModel {
  constructor({
    layer,
    // Является ли падающий блок последним в игре
    // (игрок промахнулся мимо башни и весь двигающийся блок падает вниз)
    isLastFallingBlock
  }) {
    const props = isLastFallingBlock
      ? getLastBlockProps(layer)
      : getFallingBlockProps(layer);

    props.color = COLOR.fallingBlock;

    super(props)
  }

  /** Анимирует падения блока */
  tick(delta) {
    this.mesh.position.y -= delta * 25;
  }
}


/* ==========================
  Блок, остающийся на башне
  ========================== */

/** Рассчитывает сдвиг placedBlock относительно положения двигающегося блока */
const calcPlacedBlockShift = (sideSize, layer) => {
  const shift = (sideSize - layer.overlap) / 2;
  const sign = layer.isCuttingBehind ? 1 : -1;

  return shift * sign;
};

/** Рассчитывает размеры и координаты блока, остающегося на башне */
const calcPlacedBlockProps = (layer) => {
  const width = layer.isAxisX ? layer.overlap : layer.movingBlock.width;
  const depth = layer.isAxisZ ? layer.overlap : layer.movingBlock.depth;

  const x = layer.isAxisX
    ? layer.movingBlock.mesh.position.x + calcPlacedBlockShift(layer.movingBlock.width, layer)
    : layer.movingBlock.mesh.position.x;

  const z = layer.isAxisZ
    ? layer.movingBlock.mesh.position.z + calcPlacedBlockShift(layer.movingBlock.depth, layer)
    : layer.movingBlock.mesh.position.z;

  return {
    width,
    depth,
    initPosition: new THREE.Vector3(x, layer.movingBlock.mesh.position.y, z),
    color: COLOR.placedBlock,
  };
};

class PlacedBlockModel extends BlockModel {
  constructor(layer) {
    const props = calcPlacedBlockProps(layer);

    super(props);
  }
}


/* ==========================
  Слой башни
  ========================== */

class LayerModel {
  /** Блок, который отрезается от двигающегося и падает вниз */
  fallingBlock = null;

  /** Блок, который остается на башне */
  placedBlock = null;

  /** Величина, на которую верхний блок перекрывает нижний */
  overlap = 0;

  /** Если true, блок не доехал и обрезается сзади. Если false, обрезается спереди */
  isCuttingBehind = false;

  /** Изначальное положение двигающегося блока по активной оси координат */
  _initMovingBlockPosition = -MOVING_RANGE;

  constructor({
    scene,
    // Ось, вдоль которой движется верхний блок
    axis = 'x',
    // Размеры двигающегося блока
    width,
    depth,
    // Координаты двигающегося блока
    x = 0,
    y = 0,
    z = 0,
  }) {
    this._scene = scene;
    this.axis = axis;

    /** Двигающийся блок */
    this.movingBlock = new BlockModel({
      width,
      depth,
      initPosition: new THREE.Vector3(
        this.isAxisX ? this._initMovingBlockPosition : x,
        y,
        this.isAxisZ ? this._initMovingBlockPosition : z
      ),
    });

    this._scene.add(this.movingBlock.mesh);
  }

  get isAxisX() {
    return this.axis === 'x';
  }

  get isAxisZ() {
    return this.axis === 'z';
  }

  /** Удаляет двигающийся блок */
  _removeMovingBlock() {
    this._scene.remove(this.movingBlock?.mesh);
    this.movingBlock = null;
  }

  /** Создает placedBlock */
  _createPlacedBlock() {
    this.placedBlock = new PlacedBlockModel(this);
    this._scene.add(this.placedBlock.mesh);
  }

  /** Создает отрезанный падающий блок */
  _createFallingBlock = (isLastFallingBlock) => {
    this.fallingBlock = new FallingBlockModel({ layer: this, isLastFallingBlock });
    this._scene.add(this.fallingBlock.mesh);
  };

  /**
   * Разрезает двигающийся блок на placedBlock, который остается на башне,
   * и на fallingBlock, который падает вниз
   *
   * @param prevPlacedBlock Самый верхний блок, который лежит на башне
   *
   * @returns {boolean}
   *    false - Весь двигающийся блок улетел вниз, игра проиграна
   *    true - Часть двигающегося блока осталась на башне, а часть упала, игра продолжается
   */
  cut(prevPlacedBlock) {

	  // Рассчитываем величину перекрытия
    this.overlap = this.isAxisX
      ? this.movingBlock.width - Math.abs(this.movingBlock.mesh.position.x - prevPlacedBlock.mesh.position.x)
      : this.movingBlock.depth - Math.abs(this.movingBlock.mesh.position.z - prevPlacedBlock.mesh.position.z);

		// Если двигающийся блок не перекрывает верхний блок башни, засчитывается проигрыш
    if (this.overlap <= 0) {
      this._createFallingBlock(true);
      this._removeMovingBlock();

      return false;
    }

    // Определяем, с какой стороны обрезается двигающийся блок
    this.isCuttingBehind =
      this.movingBlock.mesh.position[this.axis] - prevPlacedBlock.mesh.position[this.axis] < 0;

    this._createPlacedBlock();
    this._createFallingBlock();
    this._removeMovingBlock();

    return true;
  }

  /** Очищает слой от всех блоков */
  clear() {
    this._removeMovingBlock();

    this._scene.remove(
      this.placedBlock?.mesh,
      this.fallingBlock?.mesh
    );

    this.placedBlock = null;
    this.fallingBlock = null;
  }
}


/* ==========================
  Башня
  ========================== */

class Tower {
  /** Массив всех слоев, из которых состоит башня */
  layers = [];

  /** Направление движения верхнего блока. Может принимать значения 1 и -1 */
  _direction = 1;

  score = 0;

  /** Самый нижний статичный блок башни */
  baseBlock = new BlockModel({
    ...BASE_BLOCK_SIZE,
    color: COLOR.baseBlock,
  });

  constructor({ stage, onFinish, onScoreUpdate }) {
    this._stage = stage;
    this._finish = onFinish;
    this._scoreUpdate = onScoreUpdate;
    this.score = 0;
    this._init();
    console.log('Tower Created')
  }

  /** Индекс верхнего активного слоя башни */
  get activeLayerIndex() {
    return this.layers.length - 1;
  }

  /** Верхний активный слой башни */
  get activeLayer() {
    return this.layers[this.activeLayerIndex];
  }

  /** Предыдущий слой перед активным */
  get prevLayer() {
    return this.layers[this.activeLayerIndex - 1];
  }

  /** Самый верхний блок, лежащий на башне */
  get lastPlacedBlock() {
    return this.prevLayer?.placedBlock ?? this.baseBlock;
  }

  _init() {
    this._stage.scene.add(this.baseBlock.mesh);
    this._addFirstLayer();
  }

  /** Меняет направление движения верхнего блока на противоположное */
  _reverseDirection() {
    this._direction = this._direction * -1;
  }

  /** Добавляет первый слой над базовым блоком */
  _addFirstLayer() {
    const layer = new LayerModel({
      scene: this._stage.scene,
      width: BASE_BLOCK_SIZE.width,
      depth: BASE_BLOCK_SIZE.depth,
      y: BASE_BLOCK_SIZE.height,
    });

    this.layers.push(layer);
  }

  /** Добавляет новый слой башни */
  _addLayer() {
    const layer = new LayerModel({
      scene: this._stage.scene,
      axis: this.activeLayer.isAxisX ? 'z' : 'x',
      width: this.activeLayer.placedBlock.width,
      depth: this.activeLayer.placedBlock.depth,
      x: this.activeLayer.placedBlock.mesh.position.x,
      y: (this.activeLayerIndex + 2) * BASE_BLOCK_SIZE.height,
      z: this.activeLayer.placedBlock.mesh.position.z,
    });

    this.layers.push(layer);

    // Синхронизируем камеру, чтобы она "смотрела" на верхний блок башни
    this._stage.camera.syncPosition(
      this.lastPlacedBlock.mesh.position
    );
  }

  /** Анимирует все подвижные блоки башни */
  tick(delta) {
    // Анимация всех падающих блоков
		this.layers.forEach((layer) => layer.fallingBlock?.tick(delta));

    if (!this.activeLayer.movingBlock) {
      return;
    }

    const activeAxisPosition = this.activeLayer.movingBlock.mesh.position[this.activeLayer.axis];

    // Меняем направление, если блок выходит за пределы допустимого диапазона
		if (activeAxisPosition > MOVING_RANGE) {
      // Из-за возможности пропуска кадров есть вероятность залипания движения блока.
      // Чтобы избежать этого, устанавливаем максимально допустимые координаты
      this.activeLayer.movingBlock.mesh.position[this.activeLayer.axis] = MOVING_RANGE;

      this._reverseDirection();
    }

    if (activeAxisPosition < -MOVING_RANGE) {
      this.activeLayer.movingBlock.mesh.position[this.activeLayer.axis] = -MOVING_RANGE;

      this._reverseDirection();
    }

    // Анимация верхнего двигающегося блока
    this.activeLayer.movingBlock.mesh.position[this.activeLayer.axis] += delta * SPEED_FACTOR * this._direction;
  }

  /** Кладет двигающийся блок на башню */
  place() {
    const result = this.activeLayer.cut(this.lastPlacedBlock);

    if (result) {
      this._addLayer();
      this.score++;
      console.log("новый уровень!"+this.score);
      this._scoreUpdate(this.score);
      return;
    }

    this._finish();
  }

  /** Сбрасывает башню до первоначального состояния */
  reset() {
    this._direction = 1;
    this.score = 0;
    this.layers.forEach((layer) => layer.clear());

    this.layers = [];
    this._addFirstLayer();
    
    // Обновляем счетчик очков при сбросе
    if (this._scoreUpdate) {
      this._scoreUpdate(this.score);
    }
  }
}


/* ==========================
  Камера
  ========================== */

class CameraModel {
  /** Обзор камеры */
  _viewDistance = 20;

  /** Насколько близко видит камера */
  _near = 0.1;

  /** Насколько далеко видит камера */
  _far = 100;

  /** Изначальное положение камеры */
  _initialPosition = new THREE.Vector3(30, 30, 30);

  constructor(stage) {
    this._stage = stage;

    this.instance = new THREE.OrthographicCamera(
      this._viewDistance * -1 * this._stage.aspectRatio,
      this._viewDistance * this._stage.aspectRatio,
      this._viewDistance,
      this._viewDistance * -1,
      this._near,
      this._far,
    );

    this._init();
  }

  _init() {
    this.resetPosition();
    this.instance.lookAt(0, 0, 0);

    this._stage.scene.add(this.instance);
  }

  /** Обновляет обзор камеры */
  update() {
    this.instance.left = this._viewDistance * -1 * this._stage.aspectRatio;
    this.instance.right = this._viewDistance * this._stage.aspectRatio;

    this.instance.updateProjectionMatrix()
  }

  /** Синхронизирует положение камеры с верхним блоком башни */
  syncPosition({ x, y, z }) {
    gsap.to(this.instance.position, {
      ease: 'expo.out',
      duration: 1,
      x: this._initialPosition.x + x,
      y: this._initialPosition.y + y,
      z: this._initialPosition.z + z,
    });
  }

  /** Сбрасывает положения камеры до первоначального */
  resetPosition() {
    this.instance.position.set(...Object.values(this._initialPosition));
  }
}


/* ==========================
  Съемочная площадка
  ========================== */

class Stage {
  /** Размеры холста */
  sizes = {
    width: window.innerWidth,
    height: window.innerHeight
  };

  /** Сцена Three.js */
  scene = new THREE.Scene();

  /** Источники света */
  ambientLight = new THREE.AmbientLight('white', 2);
  directionalLight = new THREE.DirectionalLight('white', 2);

  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas });
    this.camera = new CameraModel(this);
    this._onResizeBound = this._onResize.bind(this);

    this._init();
  }

  /** Соотношение сторон холста */
  get aspectRatio() {
    return this.sizes.width / this.sizes.height;
  }

  _init() {
    // Задаем фон сцены
    this.scene.background = new THREE.Color(COLOR.background);

    // Добавляем на сцену источники света
    this.directionalLight.position.set(10, 18, 6);
    this.scene.add(this.directionalLight, this.ambientLight);

    // Добавляем на сцену вспомогательные инструменты
    // (координатные оси и отображение источника света)
    const axesHelper = new THREE.AxesHelper(20);
    const lightHelper = new THREE.DirectionalLightHelper(this.directionalLight);

    // this.scene.add(lightHelper, axesHelper);

    // Задаем первоначальные настройки рендерера
    this._updateRenderer();

    // Подписываемся на изменение размеров окна
    window.addEventListener('resize', this._onResizeBound);
  }

  /** Обновляет размеры холста при изменении размеров окна браузера */
  _onResize() {
    this.sizes.width = window.innerWidth
    this.sizes.height = window.innerHeight

    this.camera.update();

    this._updateRenderer();
  }

  /** Обновляет настройки рендерера */
  _updateRenderer() {
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /** Отрисовывает текущий кадр */
  renderFrame() {
    this.renderer.render(this.scene, this.camera.instance);
  }

  /** Отписывается от слушателей */
  destroy() {
    window.removeEventListener('resize', this._onResizeBound);
  }
}


/* ==========================
  Игра
  ========================== */

class Game {
  canvas = document.querySelector('#canvas');
  board = document.body.querySelector('.board');
  restartButton = document.body.querySelector('#button');
  scoreElement = document.body.querySelector('#score');
  startScreen = document.body.querySelector('.start-screen');
  startButton = document.body.querySelector('#start-button');

  clock = new THREE.Clock();

  /** Значение таймера на предыдущем кадре */
  _prevTimer = 0;

  /** Флаг окончания игры */
  _isGameOver = false;
  
  /** Флаг активной игры */
  _isGameActive = false;

  constructor() {
    this.stage = new Stage(this.canvas);

    this.tower = new Tower({
      stage: this.stage,
      onFinish: () => this.end(),
      onScoreUpdate: (score) => this.updateScore(score),
    });

    this._init();
  }

  _init() {
    this.tick();

    // Скрываем счетчик очков до начала игры
    this.scoreElement.parentElement.style.display = 'none';

    this.canvas.addEventListener('click', () => {
		  // Положить блок на башню можно только если игра активна и не завершилась
      if (!this._isGameActive || this._isGameOver) {
        return;
      }

      this.tower.place();
    });

    this.restartButton.addEventListener('click', () => this.restart());
    this.startButton.addEventListener('click', () => this.startGame());
    
    // Инициализируем счетчик очков
    this.updateScore(0);
  }
  
  /** Начинает игру */
  startGame() {
    this._isGameActive = true;
    this.startScreen.style.display = 'none';
    this.scoreElement.parentElement.style.display = 'block';
    
    // Сбрасываем положение камеры и башню для начала новой игры
    this.stage.camera.resetPosition();
    this.tower.reset();
  }
  
  /** Обновляет отображение счета */
  updateScore(score) {
    this.scoreElement.textContent = score;
  }

  /** Запускает покадровую анимацию */
  tick() {
    const elapsedTime = this.clock.getElapsedTime();
    const delta = elapsedTime - this._prevTimer;
    this._prevTimer = elapsedTime;

    // Анимируем башню только если игра активна
    if (this._isGameActive) {
      this.tower.tick(delta);
    }
    
    this.stage.renderFrame();

    requestAnimationFrame(() => this.tick())
  }

  /** Завершает игру */
  end() {
    this._isGameOver = true;
    this.board.style.display = 'flex';
  }

  /** Перезапускает игру заново */
  restart() {
    console.log('Restart')
	  // Сбрасываем положение камеры до первоначального
    this.stage.camera.resetPosition();

    // Сбрасываем башню до первоначального состояния
    this.tower.reset();
    
    // Обновляем счетчик
    this.updateScore(0);

    this._isGameOver = false;
    this._isGameActive = true;
    this.board.style.display = 'none';
  }
}

/* ==========================
  Запуск игры
  ========================== */

new Game();