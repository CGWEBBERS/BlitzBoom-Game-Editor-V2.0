import { Asset, Scene, ExportOptions, ExportResult, AssetType } from '../types';

// Let TypeScript know that JSZip is available globally
declare const JSZip: any;

// --- Interfaces for project data structure ---
interface ProjectDataForExport {
  projectName: string;
  resolution: { width: number; height: number } | null;
  startFullscreen: boolean;
  assets: Asset[];
  scenes: Scene[];
  initialSceneId: string;
}


// --- Templates for Export ---

const EXPORT_HTML_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title><!--PROJECT_NAME_PLACEHOLDER--></title>
    <style>
        body { margin: 0; background-color: #111827; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; font-family: sans-serif; }
        #game-container { position: relative; box-shadow: 0 0 20px rgba(0,0,0,0.5); background-color: #1f2937; }
        canvas { display: block; image-rendering: pixelated; image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; }
        #video-player { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; z-index: 5; pointer-events: none; }
        #start-screen {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background-color: rgba(31, 41, 55, 0.9);
            backdrop-filter: blur(5px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            cursor: pointer;
            transition: opacity 0.4s ease-out;
            z-index: 10;
        }
        #start-screen.hidden {
            opacity: 0;
            pointer-events: none;
        }
        #start-screen h1 {
            font-size: 3em;
            margin-bottom: 0.5em;
            text-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }
        #start-button {
            font-size: 1.5em;
            padding: 0.5em 1.5em;
            border: 2px solid white;
            border-radius: 8px;
            background: transparent;
            color: white;
            cursor: pointer;
            transition: all 0.2s;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        #start-button:hover { 
            background: #67e8f9; 
            color: #111827; 
            border-color: #67e8f9; 
            transform: scale(1.05);
            box-shadow: 0 0 15px #67e8f9;
        }
        /* Fullscreen styles */
        #game-container:fullscreen {
            width: 100%;
            height: 100%;
        }
        #game-container:fullscreen > canvas,
        #game-container:fullscreen > video {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
    </style>
</head>
<body>
    <div id="game-container">
        <canvas id="game-canvas"></canvas>
        <video id="video-player" style="display: none;"></video>
        <div id="start-screen">
            <h1><!--PROJECT_NAME_PLACEHOLDER--></h1>
            <button id="start-button">Play Game</button>
        </div>
    </div>
    <script src="runtime.js"></script>
</body>
</html>`;

const EXPORT_RUNTIME_JS = `
const BLITZBOOM_DATA = /*DATA_PLACEHOLDER*/;

// --- Helper functions ---
const getZIndex = (go) => {
    const bgController = go.behaviors.find(b => b.type === 'backgroundController');
    if (bgController) return bgController.properties.zIndex || 0;
    return go.zOrder || 0;
};

const getActiveHitboxes = (go) => {
    const transform = go.behaviors.find(b => b.type === 'transform')?.properties;
    if (!transform) return [];

    const getBoundingBox = () => {
        const scale = transform.scale || { x: 1, y: 1 };
        const width = 32 * Math.abs(scale.x);
        const height = 32 * Math.abs(scale.y);
        return { x: go.position.x - width / 2, y: go.position.y - height / 2, width, height };
    };

    if (!go.useCustomHitboxes || !go.animations) {
        return [getBoundingBox(go)];
    }

    const activeClip = go.animations?.find(anim => anim.name === go.currentAnimation);
    if (!activeClip || activeClip.frames.length === 0) {
        return [getBoundingBox(go)];
    }
    
    const frameIndex = activeClip.syncHitboxes ? 0 : (go.currentFrame || 0);
    const currentFrame = activeClip.frames[frameIndex];
    if (!currentFrame || !currentFrame.hitboxes || currentFrame.hitboxes.length === 0) {
        return [getBoundingBox(go)];
    }

    const scale = transform.scale || { x: 1, y: 1 };
    const scaleSignX = Math.sign(scale.x);
    const scaleSignY = Math.sign(scale.y);

    const renderedSpriteWidth = 32 * Math.abs(scale.x);
    const renderedSpriteHeight = 32 * Math.abs(scale.y);
    const sourceSpriteWidth = currentFrame.spriteWidth || 32;
    const sourceSpriteHeight = currentFrame.spriteHeight || 32;

    const scaleX = sourceSpriteWidth > 0 ? renderedSpriteWidth / sourceSpriteWidth : 1;
    const scaleY = sourceSpriteHeight > 0 ? renderedSpriteHeight / sourceSpriteHeight : 1;
        
    return currentFrame.hitboxes.map(hb => {
        if (hb.isLockedToSpriteBounds) {
            return {
                x: go.position.x - renderedSpriteWidth / 2,
                y: go.position.y - renderedSpriteHeight / 2,
                width: renderedSpriteWidth,
                height: renderedSpriteHeight,
            };
        }

        const localHitboxCenterX = hb.x + hb.width / 2 - sourceSpriteWidth / 2;
        const localHitboxCenterY = hb.y + hb.height / 2 - sourceSpriteHeight / 2;

        const worldOffsetX = localHitboxCenterX * scaleX * scaleSignX;
        const worldOffsetY = localHitboxCenterY * scaleY * scaleSignY;

        const worldHitboxWidth = hb.width * scaleX;
        const worldHitboxHeight = hb.height * scaleY;

        const worldHitboxX = go.position.x + worldOffsetX - worldHitboxWidth / 2;
        const worldHitboxY = go.position.y + worldOffsetY - worldHitboxHeight / 2;

        return {
            x: worldHitboxX,
            y: worldHitboxY,
            width: worldHitboxWidth,
            height: worldHitboxHeight,
        };
    });
};

const aabbCollision = (rect1, rect2) => (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
);

const sweptAABB = (box1, vel, box2) => {
    if (vel.x === 0 && (box1.x + box1.width <= box2.x || box1.x >= box2.x + box2.width)) {
        return { time: 1, normal: { x: 0, y: 0 } };
    }
    if (vel.y === 0 && (box1.y + box1.height <= box2.y || box1.y >= box2.y + box2.height)) {
        return { time: 1, normal: { x: 0, y: 0 } };
    }

    let invEntryX, invEntryY;
    let invExitX, invExitY;

    if (vel.x > 0) {
        invEntryX = box2.x - (box1.x + box1.width);
        invExitX = (box2.x + box2.width) - box1.x;
    } else {
        invEntryX = (box2.x + box2.width) - box1.x;
        invExitX = box2.x - (box1.x + box1.width);
    }

    if (vel.y > 0) {
        invEntryY = box2.y - (box1.y + box1.height);
        invExitY = (box2.y + box2.height) - box1.y;
    } else {
        invEntryY = (box2.y + box2.height) - box1.y;
        invExitY = box2.y - (box1.y + box1.height);
    }

    let entryX, entryY;
    let exitX, exitY;

    if (vel.x === 0) {
        entryX = -Infinity;
        exitX = Infinity;
    } else {
        entryX = invEntryX / vel.x;
        exitX = invExitX / vel.x;
    }

    if (vel.y === 0) {
        entryY = -Infinity;
        exitY = Infinity;
    } else {
        entryY = invEntryY / vel.y;
        exitY = invExitY / vel.y;
    }

    const entryTime = Math.max(entryX, entryY);
    const exitTime = Math.min(exitX, exitY);

    if (entryTime > exitTime || (entryX < 0 && entryY < 0) || entryX > 1 || entryY > 1) {
        return { time: 1, normal: { x: 0, y: 0 } };
    }

    const normal = { x: 0, y: 0 };
    if (entryX > entryY) {
        normal.x = vel.x > 0 ? -1 : 1;
    } else {
        normal.y = vel.y > 0 ? -1 : 1;
    }

    return { time: entryTime, normal };
};

const distance = (pos1, pos2) => {
    if (!pos1 || !pos2) return Infinity;
    return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
};

const createGameObjectFromType = (type, position, existingNames, layer) => {
  const newId = 'go-' + Date.now() + '-' + Math.random();
  let baseName = 'Object';
  if (type === 'player') baseName = 'Player';
  if (type === 'enemy') baseName = 'Enemy';
  if (type === 'platform') baseName = 'Platform';
  if (type === 'background') baseName = 'Background';
  if (type === 'bullet') baseName = 'Bullet';
  if (type === 'text') baseName = 'Text Object';
  if (type === 'hitbox') baseName = 'HitBox';
  if (type === 'tiled') baseName = 'Tiled Object';
  
  let name = baseName;
  let counter = 1;
  while(existingNames.includes(name)) {
      name = baseName + ' ' + counter;
      counter++;
  }

  const baseObject = {
    id: newId,
    name,
    type,
    layer,
    behaviors: [
      { type: 'transform', name: 'Transform', properties: { position, scale: { x: 1, y: 1 }, rotation: 0 } },
    ],
    animations: [],
    isActive: true,
  };

  const spriteRendererBehavior = { type: 'spriteRenderer', name: 'Sprite Renderer', properties: { assetId: null, renderMode: 'normal' } };

  if (type === 'bullet') {
      baseObject.behaviors[0].properties.scale = { x: 0.25, y: 0.25 };
      baseObject.behaviors.push(spriteRendererBehavior);
  } else if (type === 'sprite') {
      baseObject.behaviors.push(spriteRendererBehavior);
  } else if (type === 'tiled') {
      const tiledSpriteRenderer = { ...spriteRendererBehavior, properties: { ...spriteRendererBehavior.properties, renderMode: 'tiled', tileSize: { x: 32, y: 32 } } };
      baseObject.behaviors.push(tiledSpriteRenderer);
  }
  
  return baseObject;
};

const formatTime = (seconds) => {
    const ceilSeconds = Math.ceil(seconds);
    const minutes = Math.floor(ceilSeconds / 60);
    const remainingSeconds = ceilSeconds % 60;
    return String(minutes).padStart(2, '0') + ':' + String(remainingSeconds).padStart(2, '0');
};
// --- End Helper functions ---

// --- AI Logic ---
const updateEnemyAI = (go, node, context) => {
    const newGo = { ...go };
    const props = node.properties;
    const player = context.gameObjects.find(g => g.id === go.aiState?.targetPlayerId);

    if (!newGo.aiState) {
        newGo.aiState = {
            state: 'IDLE', stateTimer: 1, reactionTimer: 0,
            attackCooldown: 0, hitStunTimer: 0
        };
    }
    const ai = newGo.aiState;

    const healthProp = props.healthPropertyName || 'health';
    const script = newGo.behaviors.find(b => b.type === 'script');
    const currentHealth = script?.properties[healthProp];

    if (typeof currentHealth === 'number' && typeof ai.previousHealth === 'number' && currentHealth < ai.previousHealth) {
        ai.state = 'HIT_STUN';
        ai.hitStunTimer = 0.5;
        newGo.currentAnimation = props.hitAnim;
        newGo.animationTime = 0;
    }
    ai.previousHealth = currentHealth;

    Object.keys(ai).forEach(key => {
        if (key.endsWith('Timer') || key === 'attackCooldown') {
            ai[key] = Math.max(0, ai[key] - context.deltaTime);
        }
    });

    const distToPlayer = player ? distance(newGo.position, player.position) : Infinity;
    const canSeePlayer = distToPlayer < 800;
    const attacks = [
        { anim: props.attack1Anim, range: props.attack1Range, damage: props.attack1Damage },
        { anim: props.attack2Anim, range: props.attack2Range, damage: props.attack2Damage },
        { anim: props.attack3Anim, range: props.attack3Range, damage: props.attack3Damage },
    ].map((atk, i) => ({...atk, id: i + 1})).filter(a => a.anim && a.range > 0);

    let isPlayerAttacking = false;
    if (player) {
        const playerAnim = player.currentAnimation || '';
        if (playerAnim && !['Idle', 'Run', 'Walk', 'Jump', 'Fall'].includes(playerAnim)) {
            isPlayerAttacking = true;
        }
    }
    
    const activeAttackClip = attacks.find(a => a.id === ai.currentAttack);
    let isAttacking = ai.state === 'ATTACKING';
    if (isAttacking && activeAttackClip) {
        const attackAnimData = newGo.animations?.find(a => a.name === activeAttackClip.anim);
        if(attackAnimData && attackAnimData.frames.length > 0) {
            const duration = attackAnimData.frames.length / (attackAnimData.fps || 10);
            if ((newGo.animationTime ?? 0) >= duration) {
                ai.state = 'IDLE';
                ai.currentAttack = undefined;
                ai.reactionTimer = 0.1;
                isAttacking = false;
            }
        }
    }

    if (ai.reactionTimer <= 0 && ai.state !== 'HIT_STUN' && !isAttacking) {
        ai.reactionTimer = (1.1 - (props.difficulty * 0.1)) * (0.8 + Math.random() * 0.4);
        
        let decisionMade = false;
        
        if (player && isPlayerAttacking && distToPlayer < 100) {
            const blockChance = (props.difficulty - 2) * 0.1;
            if (Math.random() < blockChance) {
                ai.state = 'BLOCKING';
                ai.stateTimer = 0.5;
                decisionMade = true;
            }
        }
        
        if (!decisionMade) {
            if (player && canSeePlayer) {
                const availableAttacks = attacks.filter(a => distToPlayer <= a.range);
                if (availableAttacks.length > 0 && ai.attackCooldown <= 0) {
                    const attackChance = props.difficulty * 0.08;
                    if (Math.random() < attackChance) {
                        ai.state = 'ATTACKING';
                        ai.currentAttack = props.difficulty > 6 ? availableAttacks[0].id : availableAttacks[Math.floor(Math.random() * availableAttacks.length)].id;
                        ai.attackCooldown = (2.5 - (props.difficulty * 0.2));
                        decisionMade = true;
                    }
                } 
                
                if(!decisionMade) {
                    const optimalRange = (props.attack1Range || 70) * 0.9;
                    if (distToPlayer > optimalRange * 1.5) {
                        const jumpInChance = (props.difficulty - 5) * 0.1;
                        if (newGo.isGrounded && Math.random() < jumpInChance) {
                            ai.state = 'JUMPING';
                        } else {
                            ai.state = 'APPROACHING';
                        }
                    } else if (distToPlayer < optimalRange * 0.8) {
                        ai.state = 'RETREATING';
                    } else {
                        const footsieChance = (props.difficulty - 3) * 0.1;
                        if (Math.random() < footsieChance) {
                            ai.state = Math.random() < 0.5 ? 'APPROACHING' : 'RETREATING';
                            ai.stateTimer = 0.2 + Math.random() * 0.3;
                        } else {
                            ai.state = 'IDLE';
                        }
                    }
                }
            } else {
                ai.state = 'IDLE';
            }
        }
    }

    switch (ai.state) {
        case 'IDLE': newGo.velocity.x = 0; break;
        case 'APPROACHING': if (player) newGo.velocity.x = Math.sign(player.position.x - newGo.position.x) * props.speed; break;
        case 'ATTACKING': newGo.velocity.x = 0; break;
        case 'RETREATING': if (player) newGo.velocity.x = -Math.sign(player.position.x - newGo.position.x) * props.speed * 0.75; break;
        case 'BLOCKING': newGo.velocity.x = 0; if (ai.stateTimer <= 0) ai.state = 'IDLE'; break;
        case 'JUMPING': if (newGo.isGrounded) { newGo.velocity.y = -props.jumpStrength; if (player) newGo.velocity.x = Math.sign(player.position.x - newGo.position.x) * props.speed * 0.75; } break;
        case 'HIT_STUN': newGo.velocity.x = 0; if (ai.hitStunTimer <= 0) { ai.state = 'IDLE'; ai.reactionTimer = 0.1; } break;
    }

    const collidables = context.gameObjects.filter(g => g.type === 'platform' || g.type === 'hitbox');
    const hDisplacement = { x: newGo.velocity.x * context.deltaTime, y: 0 };
    let hCollision = { time: 1, normal: { x: 0, y: 0 } };
    const movingHitboxes = getActiveHitboxes(newGo);
    for (const staticGo of collidables) {
        if(staticGo.id === newGo.id) continue;
        const pCtrl = staticGo.behaviors.find(b => b.type === 'platformController')?.properties;
        const isSolid = (staticGo.type === 'platform' && pCtrl?.collisionType === 'solid') || staticGo.type === 'hitbox';
        if (!isSolid) continue;
        const staticHitboxes = getActiveHitboxes(staticGo);
        for (const hb1 of movingHitboxes) {
            for (const hb2 of staticHitboxes) {
                const result = sweptAABB(hb1, hDisplacement, hb2);
                if (result.time < hCollision.time) hCollision = result;
            }
        }
    }
    newGo.position.x += hDisplacement.x * hCollision.time;
    if (hCollision.time < 1) newGo.velocity.x = 0;

    newGo.isGrounded = false;
    newGo.velocity.y += props.gravity * context.deltaTime;
    const vDisplacement = { x: 0, y: newGo.velocity.y * context.deltaTime };
    let vCollision = { time: 1, normal: { x: 0, y: 0 } };
    const movingHitboxesAfterH = getActiveHitboxes(newGo);
    for (const staticGo of collidables) {
        if(staticGo.id === newGo.id) continue;
        const pCtrl = staticGo.behaviors.find(b => b.type === 'platformController')?.properties;
        const isSolid = (staticGo.type === 'platform' && pCtrl?.collisionType === 'solid') || staticGo.type === 'hitbox';
        const isJumpthrough = staticGo.type === 'platform' && pCtrl?.collisionType === 'jumpthrough';
        if (!isSolid && !isJumpthrough) continue;
        const staticHitboxes = getActiveHitboxes(staticGo);
        for (const hb1 of movingHitboxesAfterH) {
            for (const hb2 of staticHitboxes) {
                const result = sweptAABB(hb1, vDisplacement, hb2);
                if (isJumpthrough && result.normal.y !== -1) continue;
                if (result.time < vCollision.time) vCollision = result;
            }
        }
    }
    newGo.position.y += vDisplacement.y * vCollision.time;
    if (vCollision.time < 1) {
        if (vCollision.normal.y === -1) newGo.isGrounded = true;
        newGo.velocity.y = 0;
    }

    const activeAttack = attacks.find(a => a.id === ai.currentAttack);
    if (ai.state === 'ATTACKING' && activeAttack) { 
        if(newGo.currentAnimation !== activeAttack.anim) {
             newGo.currentAnimation = activeAttack.anim; 
             newGo.animationTime = 0;
        }
    }
    else if (ai.state === 'BLOCKING') { newGo.currentAnimation = props.blockAnim; }
    else if (ai.state === 'HIT_STUN') { newGo.currentAnimation = props.hitAnim; }
    else if (!newGo.isGrounded) { newGo.currentAnimation = newGo.velocity.y < 0 ? props.jumpAnim : props.fallAnim; if (ai.state === 'JUMPING' && newGo.velocity.y >= 0) ai.state = 'FALLING'; }
    else { if (ai.state === 'FALLING') ai.state = 'IDLE'; newGo.currentAnimation = newGo.velocity.x !== 0 ? props.walkAnim : props.idleAnim; }
    
    if (newGo.velocity.x !== 0) {
        const transform = newGo.behaviors.find(b => b.type === 'transform');
        if (transform) transform.properties.scale.x = Math.abs(transform.properties.scale.x) * Math.sign(newGo.velocity.x);
    } else if (player) {
        const transform = newGo.behaviors.find(b => b.type === 'transform');
        if(transform) transform.properties.scale.x = Math.abs(transform.properties.scale.x) * Math.sign(player.position.x - newGo.position.x);
    }
    
    return newGo;
};
// --- End AI Logic ---

class GameEngine {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.videoPlayer = document.getElementById('video-player');
        this.gameContainer = document.getElementById('game-container');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        
        this.projectData = null;
        this.currentScene = null;

        this.assets = {};
        this.keyboardState = {};
        this.gameObjects = [];
        this.audioPlayers = new Map();
        this.musicChannels = new Map();
        this.activeTimers = new Map();
        this.activeCountdowns = new Map();
        this.activeVideoNodeId = null;
        this.triggeredOnceNodes = new Set();
        this.lastFrameTime = 0;
        this.gameLoopId = 0;
        this.isPaused = false;
        this.cameraState = { position: { x: 0, y: 0 }, zoom: 1 };
        this.isPreviewFullscreen = false; // State for fullscreen node

        this.interpreter = null;
    }

    async start() {
        try {
            this.projectData = BLITZBOOM_DATA;
            
            this.initInput();
            await this.loadAssets();
            this.loadScene(this.projectData.initialSceneId);
        } catch(e) {
            console.error("BlitzBoom Engine: Fatal error during game initialization:", e);
            document.body.innerHTML = '<div style="color: #fca5a5; background-color: #1f2937; font-family: monospace; padding: 2em; border: 2px solid #ef4444; height: 100vh; box-sizing: border-box;">' +
                '<h1>Engine Error</h1><p>Could not start the game. Check the console for details.</p><pre style="white-space: pre-wrap; word-break: break-all;">' + e.stack + '</pre></div>';
        }
    }

    loadScene(sceneId) {
        console.log('Loading scene: ' + sceneId);
        if (this.gameLoopId) {
            cancelAnimationFrame(this.gameLoopId);
        }
        
        this.musicChannels.forEach(audio => audio.pause());
        this.musicChannels.clear();
        this.activeTimers.clear();
        this.activeCountdowns.clear();
        this.triggeredOnceNodes.clear();
        this.isPaused = false;
        this.cameraState = { position: { x: 0, y: 0 }, zoom: 1 };
        
        const sceneData = this.projectData.scenes.find(s => s.id === sceneId);
        if (!sceneData) {
            console.error('Scene with id \\'' + sceneId + '\\' not found!');
            return;
        }
        this.currentScene = sceneData;

        this.initGameObjects();
        this.interpreter = new NodeInterpreter(this, this.currentScene);
        
        this.videoPlayer.onended = () => {
            if(this.activeVideoNodeId) {
                this.interpreter.runVideoEvent(this.activeVideoNodeId, 'onFinished');
                this.activeVideoNodeId = null;
                this.videoPlayer.style.display = 'none';
            }
        };

        this.interpreter.runEvent('onStart');
        
        this.lastFrameTime = performance.now();
        this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    initGameObjects() {
        this.gameObjects = this.currentScene.gameObjects.map(go => {
             const transform = go.behaviors.find(b => b.type === 'transform');
             const position = transform ? { ...transform.properties.position } : { x: 0, y: 0 };
             return {
                ...go,
                position: position,
                velocity: { x: 0, y: 0 },
                initialPosition: position,
                patrolTime: 0,
                prevPosition: position,
                isGrounded: false,
                currentAnimation: 'Idle',
                animationTime: 0,
                animationSpeed: 1,
                currentFrame: 0,
                isActive: go.isActive ?? true,
            };
        });
    }

    initInput() {
        window.addEventListener('keydown', e => this.keyboardState[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', e => this.keyboardState[e.key.toLowerCase()] = false);
        this.canvas.addEventListener('pointerdown', this.handleCanvasClick.bind(this));
    }
    
    handleCanvasClick(event) {
        if (this.isPaused) return;
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;

        // --- Correct coordinate mapping for fullscreen ---
        const resolution = this.projectData.resolution;
        if (!resolution) return; // Safety check
        const gameRatio = resolution.width / resolution.height;
        const screenRatio = this.canvas.clientWidth / this.canvas.clientHeight;

        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;

        if (screenRatio > gameRatio) { // Letterboxed horizontally (wider screen)
            scale = this.canvas.clientHeight / resolution.height;
            offsetX = (this.canvas.clientWidth - resolution.width * scale) / 2;
        } else { // Letterboxed vertically (taller screen)
            scale = this.canvas.clientWidth / resolution.width;
            offsetY = (this.canvas.clientHeight - resolution.height * scale) / 2;
        }
        
        const mouseInGameScreenX = (screenX - offsetX) / scale;
        const mouseInGameScreenY = (screenY - offsetY) / scale;

        // Invert camera transform to get world coordinates
        const worldX = (mouseInGameScreenX - resolution.width / 2) / this.cameraState.zoom + this.cameraState.position.x;
        const worldY = (mouseInGameScreenY - resolution.height / 2) / this.cameraState.zoom + this.cameraState.position.y;
        const clickPoint = { x: worldX, y: worldY };

        // Iterate from top-most to bottom-most
        const sortedObjects = [...this.gameObjects].sort((a, b) => getZIndex(b) - getZIndex(a));
        
        for (const go of sortedObjects) {
            if (!(go.isActive ?? true)) continue;

            const hitboxes = getActiveHitboxes(go);
            for (const box of hitboxes) {
                if (clickPoint.x >= box.x && clickPoint.x <= box.x + box.width &&
                    clickPoint.y >= box.y && clickPoint.y <= box.y + box.height) {
                    
                    this.interpreter.runClickEvent(go.id);
                    return; // Stop after finding the top-most object
                }
            }
        }
    }

    spawnGameObject(type, position) {
        const existingNames = this.gameObjects.map(go => go.name);
        const newObject = createGameObjectFromType(type, position, existingNames, 'Default');
        const newSimObject = {
            ...newObject,
            position,
            velocity: { x: 0, y: 0 },
            initialPosition: position,
            patrolTime: 0,
            prevPosition: position,
            isGrounded: false,
            currentAnimation: null,
            animationTime: 0,
            animationSpeed: 1,
            currentFrame: 0,
            isActive: true,
        };
        this.gameObjects.push(newSimObject);
        return newSimObject;
    }

    loadAssets() {
        const assetPromises = [];
        const flattenedAssets = [];
        
        function traverse(assetsNode) {
            if (!assetsNode) return;
            assetsNode.forEach(asset => {
                if ((asset.type === 'image' || asset.type === 'audio' || asset.type === 'video' || asset.type === 'font') && asset.path) {
                    flattenedAssets.push(asset);
                }
                if (asset.children) {
                    traverse(asset.children);
                }
            });
        }
        traverse(this.projectData.assets);

        for(const asset of flattenedAssets) {
            if (asset.type === 'image') {
                const promise = new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => { this.assets[asset.id] = img; resolve(); };
                    img.onerror = (err) => { console.error('Failed to load asset: ' + asset.path, err); reject(new Error('Failed to load asset: ' + asset.path)); };
                    img.src = asset.path;
                });
                assetPromises.push(promise);
            } else if (asset.type === 'audio' || asset.type === 'video') {
                 const promise = new Promise((resolve, reject) => {
                    const mediaElement = asset.type === 'audio' ? new Audio() : document.createElement('video');
                    mediaElement.oncanplaythrough = () => { this.assets[asset.id] = mediaElement; this.audioPlayers.set(asset.id, mediaElement); resolve(); };
                    mediaElement.onerror = (err) => { console.error('Failed to load media asset: ' + asset.path, err); reject(new Error('Failed to load media asset: ' + asset.path)); };
                    mediaElement.src = asset.path;
                });
                assetPromises.push(promise);
            } else if (asset.type === 'font') {
                 const promise = new Promise((resolve, reject) => {
                    const encodedPath = encodeURI(asset.path);
                    const fontFace = new FontFace(asset.id, 'url(' + encodedPath + ')');
                    fontFace.load().then((loadedFace) => {
                        document.fonts.add(loadedFace);
                        this.assets[asset.id] = loadedFace;
                        resolve();
                    }).catch(err => {
                        console.error('Failed to load font: ' + asset.path, err);
                        reject(new Error('Failed to load font: ' + asset.path));
                    });
                });
                assetPromises.push(promise);
            }
        }
        return Promise.all(assetPromises);
    }
    
    getGameObjectSprite(go) {
        if (go.currentAnimation && go.animations) {
            const activeClip = go.animations.find(anim => anim.name === go.currentAnimation);
            if (activeClip && activeClip.frames.length > 0) {
                const frameIndex = go.currentFrame || 0;
                const currentFrame = activeClip.frames[frameIndex];
                if (currentFrame?.spriteAssetId) return this.assets[currentFrame.spriteAssetId];
            }
        }
        const idleAnimation = go.animations?.find(anim => anim.name.toLowerCase() === 'idle');
        if (idleAnimation && idleAnimation.frames.length > 0) {
            const frame = idleAnimation.frames[0];
            if (frame.spriteAssetId) return this.assets[frame.spriteAssetId];
        }
        const spriteRenderer = go.behaviors.find(b => b.type === 'spriteRenderer');
        if (spriteRenderer?.properties.assetId) return this.assets[spriteRenderer.properties.assetId];
        return null;
    }

    updateMovingPlatforms(deltaTime) {
        if (deltaTime === 0) return;
        this.gameObjects = this.gameObjects.map(go => {
            if (go.type !== 'platform' || !go.initialPosition || !(go.isActive ?? true)) {
                if (go.type === 'platform') return { ...go, velocity: { x: 0, y: 0 } };
                return go;
            }
            const controller = go.behaviors.find(b => b.type === 'platformController')?.properties;
            if (!controller || controller.moveDirection === 'None' || controller.moveSpeed <= 0) return { ...go, velocity: { x: 0, y: 0 } };
            
            const prevPosition = { ...go.position };
            const newGo = { ...go, position: { ...go.position }, patrolTime: (go.patrolTime || 0) + deltaTime };
            const { moveSpeed: speed, moveDistance: distance, moveDirection } = controller;
            const duration = speed > 0 ? distance / speed : 0;
            if (duration > 0) {
                const offset = Math.sin((newGo.patrolTime / duration) * Math.PI) * (distance / 2);
                if (moveDirection === 'Horizontal') newGo.position.x = go.initialPosition.x + offset;
                else if (moveDirection === 'Vertical') newGo.position.y = go.initialPosition.y + offset;
            }
            newGo.velocity = { x: (newGo.position.x - prevPosition.x) / deltaTime, y: (newGo.position.y - prevPosition.y) / deltaTime };
            return newGo;
        });
    }

    pause() { this.isPaused = true; }
    resume() { this.isPaused = false; }
    togglePause() { this.isPaused = !this.isPaused; }

    gameLoop(timestamp) {
        try {
            if (this.isPaused) {
                this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));
                return;
            }

            const now = performance.now();
            let deltaTime = (now - this.lastFrameTime) / 1000;
            this.lastFrameTime = now;
            if (deltaTime > 1 / 30) deltaTime = 1 / 30;

            const timersToRemove = [], timersToReset = [];
            for (const [id, timer] of this.activeTimers.entries()) {
                if (now >= timer.startTime + timer.duration * 1000) {
                    this.interpreter.runTimerEvent(id);
                    if (timer.loop) timersToReset.push({ id, timer: { ...timer, startTime: now } });
                    else timersToRemove.push(id);
                }
            }
            timersToRemove.forEach(id => this.activeTimers.delete(id));
            timersToReset.forEach(({ id, timer }) => this.activeTimers.set(id, timer));

            const finishedCountdowns = [];
            if (this.activeCountdowns.size > 0) {
                this.activeCountdowns.forEach((countdown, nodeId) => {
                    if (countdown.isFinished) return;
                    const remainingMs = Math.max(0, countdown.endTime - now);
                    const formattedTime = formatTime(remainingMs / 1000);
                    this.gameObjects = this.gameObjects.map(go => {
                        if (go.id === countdown.targetId) {
                            const textRenderer = go.behaviors.find(b => b.type === 'textRenderer');
                            if (textRenderer && textRenderer.properties.text !== formattedTime) {
                                const newGo = JSON.parse(JSON.stringify(go));
                                newGo.behaviors.find(b => b.type === 'textRenderer').properties.text = formattedTime;
                                return newGo;
                            }
                        }
                        return go;
                    });
                    if (remainingMs === 0) {
                        countdown.isFinished = true;
                        finishedCountdowns.push(nodeId);
                    }
                });
            }
            if (finishedCountdowns.length > 0) {
                finishedCountdowns.forEach(nodeId => {
                    this.interpreter.runTimerEvent(nodeId, 'onFinished');
                    this.activeCountdowns.delete(nodeId);
                });
            }
            
            this.gameObjects = this.gameObjects.map(go => {
                if (go.animations?.length > 0 && go.currentAnimation) {
                    const clip = go.animations.find(a => a.name === go.currentAnimation);
                    if (clip?.frames.length > 0) {
                        const frameDuration = 1 / (clip.fps || 10);
                        let newTime = (go.animationTime || 0) + (deltaTime * (go.animationSpeed || 1));
                        let frameIndex = Math.floor(newTime / frameDuration);
                        if (clip.loop) frameIndex %= clip.frames.length;
                        else frameIndex = Math.min(frameIndex, clip.frames.length - 1);
                        return { ...go, animationTime: newTime, currentFrame: frameIndex };
                    }
                }
                return go;
            });

            // --- Run Active AIs ---
            this.gameObjects = this.gameObjects.map(go => {
                if (go.aiControllerNodeId && (go.isActive ?? true)) {
                    const aiNode = this.currentScene.nodes.find(n => n.id === go.aiControllerNodeId);
                    if (aiNode) {
                        const aiContext = this.interpreter.createContext(deltaTime);
                        return updateEnemyAI(go, aiNode, aiContext);
                    }
                }
                return go;
            });


            this.updateMovingPlatforms(deltaTime);
            this.interpreter.runEvent('onUpdate', deltaTime);

            // --- Custom Hitbox Collision Detection ---
            const collidableObjects = this.gameObjects.filter(go => go.useCustomHitboxes && (go.isActive ?? true));
            for (let i = 0; i < collidableObjects.length; i++) {
                for (let j = i + 1; j < collidableObjects.length; j++) {
                    const objA = collidableObjects[i];
                    const objB = collidableObjects[j];
                    
                    const hitboxesA = getActiveHitboxes(objA);
                    const hitboxesB = getActiveHitboxes(objB);

                    let collisionFound = false;
                    for (const boxA of hitboxesA) {
                        for (const boxB of hitboxesB) {
                            if (aabbCollision(boxA, boxB)) {
                                this.interpreter.runCollisionEvent(objA.id, objB.id);
                                collisionFound = true;
                                break;
                            }
                        }
                        if (collisionFound) break;
                    }
                }
            }

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#1f2937';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.save();
            this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
            this.ctx.scale(this.cameraState.zoom, this.cameraState.zoom);
            this.ctx.translate(-this.cameraState.position.x, -this.cameraState.position.y);

            const sortedGameObjects = [...this.gameObjects].sort((a, b) => getZIndex(a) - getZIndex(b));
            sortedGameObjects.forEach(go => {
                if (go.type === 'platform') {
                    const platformController = go.behaviors.find(b => b.type === 'platformController');
                    if (platformController && platformController.properties.isVisible === false) {
                        return; // Skip rendering this platform
                    }
                }
                
                if (go.type === 'text') {
                    const textRenderer = go.behaviors.find(b => b.type === 'textRenderer');
                    if (textRenderer) {
                        const props = textRenderer.properties;
                        const fontAssetId = props.customFontAssetId;
                        const fontFamily = fontAssetId ? fontAssetId : props.font;
                        
                        this.ctx.save();
                        this.ctx.font = (props.style || 'normal') + ' ' + props.size + 'px ' + fontFamily;
                        this.ctx.fillStyle = props.color;
                        this.ctx.textAlign = props.align;
                        this.ctx.textBaseline = 'middle';

                        const lines = String(props.text).split('\\n');
                        const lineHeight = props.size * 1.2;
                        const totalHeight = (lines.length - 1) * lineHeight;

                        lines.forEach((line, index) => {
                            const yOffset = (index * lineHeight) - (totalHeight / 2);
                            this.ctx.fillText(line, go.position.x, go.position.y + yOffset);
                        });
                        this.ctx.restore();
                    }
                } else {
                    const img = this.getGameObjectSprite(go);
                    if (!img) return;
                    
                    const transform = go.behaviors.find(b => b.type === 'transform')?.properties;
                    if (!transform) return;
                    
                    const scale = transform.scale || { x: 1, y: 1 };
                    const width = 32 * Math.abs(scale.x);
                    const height = 32 * Math.abs(scale.y);
                    let renderPosition = go.position;
                    const bgController = go.behaviors.find(b => b.type === 'backgroundController');
                    if (bgController) {
                        const p = bgController.properties.parallaxSpeed || { x: 1, y: 1 };
                        renderPosition = { x: go.position.x + this.cameraState.position.x * (1 - p.x), y: go.position.y + this.cameraState.position.y * (1 - p.y) };
                    }
                    
                    this.ctx.save();
                    this.ctx.translate(renderPosition.x, renderPosition.y);
                    this.ctx.scale(Math.sign(scale.x), Math.sign(scale.y));

                    const spriteRenderer = go.behaviors.find(b => b.type === 'spriteRenderer');
                    if (spriteRenderer?.properties.renderMode === 'tiled') {
                        const tileSize = spriteRenderer.properties.tileSize || { x: 32, y: 32 };
                        if (tileSize.x > 0 && tileSize.y > 0) {
                            this.ctx.save();
                            this.ctx.beginPath();
                            this.ctx.rect(-width / 2, -height / 2, width, height);
                            this.ctx.clip();
                            for (let y = -height / 2; y < height / 2; y += tileSize.y) {
                                for (let x = -width / 2; x < width / 2; x += tileSize.x) {
                                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                                        this.ctx.drawImage(
                                            img,
                                            0, 0,
                                            img.naturalWidth,
                                            img.naturalHeight,
                                            x, y,
                                            tileSize.x, tileSize.y
                                        );
                                    }
                                }
                            }
                            this.ctx.restore();
                        }
                    } else {
                        this.ctx.drawImage(img, -width / 2, -height / 2, width, height);
                    }
                    this.ctx.restore();
                }
            });
            this.ctx.restore();
            this.gameLoopId = requestAnimationFrame(this.gameLoop.bind(this));
        } catch(e) {
            console.error("BlitzBoom Engine: Fatal error during game loop:", e);
            if (this.gameLoopId) cancelAnimationFrame(this.gameLoopId);
            document.body.innerHTML = '<div style="color: #fca5a5; background-color: #1f2937; font-family: monospace; padding: 2em; border: 2px solid #ef4444; height: 100vh; box-sizing: border-box;"><h1>Engine Error</h1><p>The game has crashed. Check the console for details.</p><pre style="white-space: pre-wrap; word-break: break-all;">' + e.stack + '</pre></div>';
        }
    }
}

class NodeInterpreter {
    constructor(engine, scene) {
        this.engine = engine;
        this.nodes = scene.nodes;
        this.connections = scene.connections;
        this.nodeOutputCache = new Map();
        this.nodeLogic = {};
        this.initializeNodeLogic();
    }

    createContext(deltaTime = 0) {
        return {
            engine: {
                loadScene: this.engine.loadScene.bind(this.engine),
                pause: this.engine.pause.bind(this.engine),
                resume: this.engine.resume.bind(this.engine),
                togglePause: this.engine.togglePause.bind(this.engine),
                spawnGameObject: this.engine.spawnGameObject.bind(this.engine),
            },
            nodes: this.nodes,
            connections: this.connections,
            gameObjects: this.engine.gameObjects,
            keyboardState: this.engine.keyboardState,
            audioPlayers: this.engine.audioPlayers,
            musicChannels: this.engine.musicChannels,
            videoState: null, // This is managed by the engine directly now
            cameraState: this.engine.cameraState,
            activeTimers: this.engine.activeTimers,
            activeCountdowns: this.engine.activeCountdowns,
            triggeredOnceNodes: this.engine.triggeredOnceNodes,
            deltaTime,
            setGameObjects: (action) => { this.engine.gameObjects = typeof action === 'function' ? action(this.engine.gameObjects) : action; },
            setVideoState: (action) => {
                const newState = typeof action === 'function' ? action(this.engine.videoState) : action;
                if (newState && newState.isPlaying) {
                     const p = this.engine.videoPlayer;
                     const asset = this.engine.assets[newState.assetId];
                     if (asset) {
                         p.src = asset.src;
                         p.loop = newState.loop;
                         p.volume = newState.volume;
                         p.style.display = 'block';
                         p.play();
                         this.engine.activeVideoNodeId = newState.nodeId;
                     }
                } else if (this.engine.activeVideoNodeId) {
                     const p = this.engine.videoPlayer;
                     p.pause();
                     p.style.display = 'none';
                     this.engine.activeVideoNodeId = null;
                }
            },
            setCameraState: (action) => { this.engine.cameraState = typeof action === 'function' ? action(this.engine.cameraState) : action; },
            setPreviewFullscreen: (action) => {
                const elem = this.engine.gameContainer;
                const isFullscreen = !!document.fullscreenElement;
                const shouldBeFullscreen = typeof action === 'function' ? action(isFullscreen) : action;
                if (shouldBeFullscreen && !isFullscreen) {
                    if (elem.requestFullscreen) elem.requestFullscreen();
                } else if (!shouldBeFullscreen && isFullscreen) {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
            },
            addLog: (msg) => console.log('[Game Log]', msg),
            evaluateInput: this.evaluateInput.bind(this),
            triggerOutput: this.triggerOutput.bind(this),
            nodeOutputCache: this.nodeOutputCache,
        };
    }

    runEvent(eventType, deltaTime = 0) {
        this.nodeOutputCache.clear();
        const context = this.createContext(deltaTime);
        this.nodes.filter(n => n.type === eventType).forEach(node => this.triggerOutput(node.id, 'execOut', context));
    }

    runTimerEvent(timerNodeId, pinId = 'onFinished') {
        const timerNode = this.nodes.find(n => n.id === timerNodeId);
        if (timerNode) this.triggerOutput(timerNode.id, pinId, this.createContext(0));
    }

    runCollisionEvent(objectAId, objectBId) {
        this.nodeOutputCache.clear();
        const context = this.createContext(0);
        this.nodes.filter(n => n.type === 'onCollision').forEach(node => {
            context.nodeOutputCache.set(node.id + '-objectA', objectAId);
            context.nodeOutputCache.set(node.id + '-objectB', objectBId);
            this.triggerOutput(node.id, 'execOut', context);
        });
    }

    runClickEvent(clickedObjectId) {
        this.nodeOutputCache.clear();
        const context = this.createContext(0);
        this.nodes
            .filter(n => n.type === 'onClickOrTouch' && (!n.properties.targetObjectId || n.properties.targetObjectId === clickedObjectId))
            .forEach(node => {
                this.triggerOutput(node.id, 'execOut', context);
            });
    }

    runVideoEvent(videoNodeId, pinId) {
        const videoNode = this.nodes.find(n => n.id === videoNodeId);
        if (videoNode) this.triggerOutput(videoNode.id, pinId, this.createContext(0));
    }

    evaluateInput(nodeId, pinId, context) {
        const connection = this.connections.find(c => c.toNodeId === nodeId && c.toInputId === pinId);
        if (!connection) return undefined;
        const sourceNodeId = connection.fromNodeId, sourcePinId = connection.fromOutputId;
        const cacheKey = sourceNodeId + '-' + sourcePinId;
        if (context.nodeOutputCache.has(cacheKey)) return context.nodeOutputCache.get(cacheKey);
        const sourceNode = this.nodes.find(n => n.id === sourceNodeId);
        if (sourceNode && this.nodeLogic[sourceNode.type]) {
            this.nodeLogic[sourceNode.type](sourceNode, context);
            return context.nodeOutputCache.get(cacheKey);
        }
        return undefined;
    }

    triggerOutput(nodeId, pinId, context) {
        this.connections.filter(c => c.fromNodeId === nodeId && c.fromOutputId === pinId).forEach(connection => {
            const nextNode = this.nodes.find(n => n.id === connection.toNodeId);
            if (nextNode && this.nodeLogic[nextNode.type]) {
                this.nodeLogic[nextNode.type](nextNode, {...context, triggeredPinId: connection.toInputId});
            }
        });
    }
    
    initializeNodeLogic() {
        this.nodeLogic = {
'branch': (node, context) => {
    const condition = context.evaluateInput(node.id, 'condition', context);
    if (condition) {
        context.triggerOutput(node.id, 'execOutTrue', context);
    } else {
        context.triggerOutput(node.id, 'execOutFalse', context);
    }
},
'greaterThan': (node, context) => {
    const a = context.evaluateInput(node.id, 'a', context) ?? 0;
    const b = context.evaluateInput(node.id, 'b', context) ?? 0;
    context.nodeOutputCache.set(node.id + '-result', a > b);
},
'lessThan': (node, context) => {
    const a = context.evaluateInput(node.id, 'a', context) ?? 0;
    const b = context.evaluateInput(node.id, 'b', context) ?? 0;
    context.nodeOutputCache.set(node.id + '-result', a < b);
},
'string': (node, context) => {
    context.nodeOutputCache.set(node.id + '-value', node.properties.value);
},
'number': (node, context) => {
    context.nodeOutputCache.set(node.id + '-value', Number(node.properties.value));
},
'boolean': (node, context) => {
    context.nodeOutputCache.set(node.id + '-value', node.properties.value);
},
'vector2': (node, context) => {
    const x = Number(node.properties.x);
    const y = Number(node.properties.y);
    context.nodeOutputCache.set(node.id + '-value', { x, y });
},
'getGameObject': (node, context) => {
    const objectName = node.properties.objectName;
    const foundObject = context.gameObjects.find(go => go.name === objectName);
    context.nodeOutputCache.set(node.id + '-objectOut', foundObject?.id);
},
'getProperty': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    const propertyName = node.properties.propertyName;
    if (!targetId || !propertyName) {
        context.nodeOutputCache.set(node.id + '-value', undefined);
        return;
    }
    const targetObject = context.gameObjects.find(go => go.id === targetId);
    if (!targetObject) {
        context.nodeOutputCache.set(node.id + '-value', undefined);
        return;
    }
    if (Object.prototype.hasOwnProperty.call(targetObject, propertyName)) {
        const value = targetObject[propertyName];
        context.nodeOutputCache.set(node.id + '-value', value);
        return;
    }
    const scriptBehavior = targetObject.behaviors.find(b => b.type === 'script');
    if (scriptBehavior && Object.prototype.hasOwnProperty.call(scriptBehavior.properties, propertyName)) {
         const value = scriptBehavior.properties[propertyName];
         context.nodeOutputCache.set(node.id + '-value', value);
         return;
    }
    context.nodeOutputCache.set(node.id + '-value', undefined);
},
'getKey': (node, context) => {
    const key = String(node.properties.key).toLowerCase();
    const isDown = !!context.keyboardState[key];
    context.nodeOutputCache.set(node.id + '-isDown', isDown);
},
'getAxis': (node, context) => {
    const negativeKey = String(node.properties.negativeKey).toLowerCase();
    const positiveKey = String(node.properties.positiveKey).toLowerCase();
    const negativeDown = !!context.keyboardState[negativeKey];
    const positiveDown = !!context.keyboardState[positiveKey];
    let axisValue = 0;
    if (positiveDown) {
        axisValue += 1;
    }
    if (negativeDown) {
        axisValue -= 1;
    }
    context.nodeOutputCache.set(node.id + '-axis', axisValue);
},
'logMessage': (node, context) => {
    const message = context.evaluateInput(node.id, 'message', context);
    context.addLog('[Node Log]: ' + JSON.stringify(message));
    context.triggerOutput(node.id, 'execOut', context);
},
'moveObject': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    const direction = node.properties.direction;
    const speed = Number(node.properties.speed) || 0;
    if (targetId && speed !== 0) {
        context.setGameObjects(gos => gos.map(go => {
            if (go.id === targetId) {
                const newGo = { 
                    ...go,
                    position: { ...go.position }
                };
                if (direction === 'X') {
                    newGo.position.x += speed * context.deltaTime;
                } else if (direction === 'Y') {
                    newGo.position.y += speed * context.deltaTime;
                }
                return newGo;
            }
            return go;
        }));
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'setPosition': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    if (!targetId) {
        context.triggerOutput(node.id, 'execOut', context);
        return;
    }
    let basePosition = null;
    const objectToFollowId = context.evaluateInput(node.id, 'objectToFollow', context);
    const positionFromPin = context.evaluateInput(node.id, 'position', context);
    if (objectToFollowId) {
        const objectToFollow = context.gameObjects.find(go => go.id === objectToFollowId);
        if (objectToFollow) {
            basePosition = objectToFollow.position;
        }
    } else if (node.properties.targetObjectName) {
        const objectToFollow = context.gameObjects.find(go => go.name === node.properties.targetObjectName);
        if (objectToFollow) {
            basePosition = objectToFollow.position;
        } else {
            context.addLog('[Warning] Set Position: Could not find object with name \\'' + node.properties.targetObjectName + '\\'.');
        }
    } else if (positionFromPin) {
        basePosition = positionFromPin;
    } else {
        basePosition = node.properties.position;
    }
    if (basePosition) {
        const offset = node.properties.offset || { x: 0, y: 0 };
        const finalPosition = {
            x: basePosition.x + offset.x,
            y: basePosition.y + offset.y,
        };
        context.setGameObjects(gos => gos.map(go => 
            go.id === targetId ? { ...go, position: { ...finalPosition } } : go
        ));
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'setProperty': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    const value = context.evaluateInput(node.id, 'value', context);
    const propertyName = node.properties.propertyName;
    if (targetId && propertyName && value !== undefined) {
        context.setGameObjects(gos => gos.map(go => {
            if (go.id === targetId) {
                const scriptIndex = go.behaviors.findIndex(b => b.type === 'script');
                if (scriptIndex === -1) {
                    return go;
                }
                const newBehaviors = [...go.behaviors];
                newBehaviors[scriptIndex] = {
                    ...newBehaviors[scriptIndex],
                    properties: {
                        ...newBehaviors[scriptIndex].properties,
                        [propertyName]: value,
                    },
                };
                return { ...go, behaviors: newBehaviors };
            }
            return go;
        }));
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'activateObject': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    const action = node.properties.action || 'Activate';
    const isActive = action === 'Activate';
    if (targetId) {
        context.setGameObjects(gos => gos.map(go => 
            go.id === targetId ? { ...go, isActive } : go
        ));
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'changeAnimation': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    const animationName = node.properties.animationName || 'Idle';
    const animationSpeed = Number(node.properties.animationSpeed) || 1;
    const restartIfPlaying = node.properties.restartIfPlaying === true;
    if (targetId) {
        context.setGameObjects(gos => gos.map(go => {
            if (go.id === targetId) {
                if (restartIfPlaying || go.currentAnimation !== animationName) {
                    return { 
                        ...go,
                        currentAnimation: animationName,
                        animationSpeed: animationSpeed,
                        animationTime: 0,
                        currentFrame: 0,
                    };
                }
            }
            return go;
        }));
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'playMusic': (node, context) => {
    const { action = 'Play', musicAssetId, loop = true, volume = 1.0, channel = 0 } = node.properties;
    const channelNum = Number(channel) || 0;
    const { audioPlayers, musicChannels } = context;
    if (action === 'Play') {
        if (musicAssetId) {
            const preloadedAudio = audioPlayers.get(musicAssetId);
            if (preloadedAudio) {
                const existingAudio = musicChannels.get(channelNum);
                if (existingAudio) {
                    existingAudio.pause();
                    existingAudio.currentTime = 0;
                }
                const newAudio = preloadedAudio.cloneNode();
                newAudio.loop = loop;
                newAudio.volume = Math.max(0, Math.min(1, volume));
                newAudio.play().catch(e => context.addLog('[Audio Error]: Could not play music. ' + e.message));
                musicChannels.set(channelNum, newAudio);
            } else {
                context.addLog('[Audio Warning]: Music asset with ID \\'' + musicAssetId + '\\' not found or loaded.');
            }
        } else {
            context.addLog('[Audio Warning]: \\'Play Music\\' node is missing an audio file.');
        }
    } else {
        const audioOnChannel = musicChannels.get(channelNum);
        if (audioOnChannel) {
            if (action === 'Pause') {
                audioOnChannel.pause();
            } else if (action === 'Stop') {
                audioOnChannel.pause();
                audioOnChannel.currentTime = 0;
                musicChannels.delete(channelNum);
            }
        }
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'sounds': (node, context) => {
    const assetId = node.properties.soundAssetId;
    const volume = Math.max(0, Math.min(1, Number(node.properties.volume) || 1));
    const speed = Math.max(0.1, Number(node.properties.speed) || 1);
    if (assetId) {
        const preloadedAudio = context.audioPlayers.get(assetId);
        if (!preloadedAudio) {
            context.addLog('[Audio Warning]: Sound asset with ID \\'' + assetId + '\\' not found or loaded.');
        } else {
            const soundEffect = preloadedAudio.cloneNode();
            soundEffect.volume = volume;
            soundEffect.playbackRate = speed;
            soundEffect.loop = false;
            soundEffect.play().catch(e => context.addLog('[Audio Error]: Could not play sound. ' + e.message));
        }
    } else {
        context.addLog('[Audio Warning]: \\'Play Sound\\' node is missing an audio file.');
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'playVideo': (node, context) => {
    const action = node.properties.action || 'Play';
    const assetId = node.properties.videoAssetId;
    const loop = node.properties.loop === true;
    const volume = Math.max(0, Math.min(1, Number(node.properties.volume) || 1));
    if (action === 'Play') {
        if (assetId) {
            context.setVideoState({
                assetId,
                nodeId: node.id,
                isPlaying: true,
                loop,
                volume,
            });
        } else {
             context.addLog("[Video Warning]: 'Play Video' node is missing a video file.");
        }
    } else if (context.videoState) {
        if (action === 'Pause') {
            context.setVideoState(prev => prev ? ({ ...prev, isPlaying: false }) : null);
        } else if (action === 'Stop') {
            context.setVideoState(null);
        }
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'timer': (node, context) => {
    const duration = Number(node.properties.duration) || 1;
    const loop = node.properties.loop === true;
    if (context.triggeredPinId === 'start') {
        context.activeTimers.set(node.id, { 
            startTime: performance.now(), 
            duration, 
            loop 
        });
    } else if (context.triggeredPinId === 'stop') {
        context.activeTimers.delete(node.id);
    }
},
'triggerOnce': (node, context) => {
    if (!context.triggeredOnceNodes.has(node.id)) {
        context.triggeredOnceNodes.add(node.id);
        context.triggerOutput(node.id, 'execOut', context);
    }
},
'changeScene': (node, context) => {
    const sceneId = node.properties.sceneId;
    if (sceneId) {
        context.engine.loadScene(sceneId);
    } else {
        context.addLog("[Warning] Change Scene node is missing a target scene.");
    }
},
'pauseScene': (node, context) => {
    const action = node.properties.action || 'Toggle';
    switch(action) {
        case 'Pause':
            context.engine.pause();
            break;
        case 'Resume':
            context.engine.resume();
            break;
        case 'Toggle':
            context.engine.togglePause();
            break;
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'camera': (node, context) => {
    const { cameraType = '2D Follow' } = node.properties;
    if (cameraType !== '2D Follow') {
        context.addLog('[Warning] Camera node type \\'' + cameraType + '\\' is not yet implemented and will have no effect.');
        context.triggerOutput(node.id, 'execOut', context);
        return;
    }
    const targetId = context.evaluateInput(node.id, 'target', context);
    const targetName = node.properties.targetName;
    const sensitivity = Number(node.properties.sensitivity) || 0.1;
    const zoom = Number(node.properties.zoom) || 1;
    const offset = node.properties.offset || { x: 0, y: 0 };
    const bounds = node.properties.bounds;
    let finalTarget = null;
    if (targetId) {
        finalTarget = context.gameObjects.find(go => go.id === targetId);
    } else if (targetName) {
        finalTarget = context.gameObjects.find(go => go.name === targetName);
    }
    context.setCameraState(prev => {
        let desiredPos = prev.position;
        if (finalTarget) {
            desiredPos = {
                x: finalTarget.position.x + offset.x,
                y: finalTarget.position.y + offset.y,
            };
        }
        const newX = prev.position.x + (desiredPos.x - prev.position.x) * sensitivity;
        const newY = prev.position.y + (desiredPos.y - prev.position.y) * sensitivity;
        let finalX = newX;
        let finalY = newY;
        if (bounds && typeof bounds.minX === 'number' && typeof bounds.maxX === 'number' && typeof bounds.minY === 'number' && typeof bounds.maxY === 'number') {
            const { minX, minY, maxX, maxY } = bounds;
            finalX = Math.max(minX, Math.min(maxX, newX));
            finalY = Math.max(minY, Math.min(maxY, newY));
        }
        return {
            position: { x: finalX, y: finalY },
            zoom: zoom,
        };
    });
    context.triggerOutput(node.id, 'execOut', context);
},
'fullScreen': (node, context) => {
    if (context.setPreviewFullscreen) {
        const action = node.properties.action || 'Toggle';
        switch(action) {
            case 'Enter':
                context.setPreviewFullscreen(true);
                break;
            case 'Exit':
                context.setPreviewFullscreen(false);
                break;
            case 'Toggle':
                context.setPreviewFullscreen(prev => !prev);
                break;
        }
    } else {
        context.addLog('[Info] Full Screen node triggered in a non-preview context.');
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'getPosition': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    if (!targetId) {
        context.nodeOutputCache.set(node.id + '-position', undefined);
        return;
    }
    const targetObject = context.gameObjects.find(go => go.id === targetId);
    context.nodeOutputCache.set(node.id + '-position', targetObject?.position);
},
'addVector2': (node, context) => {
    const a = context.evaluateInput(node.id, 'a', context) || { x: 0, y: 0 };
    const b = context.evaluateInput(node.id, 'b', context) || { x: 0, y: 0 };
    context.nodeOutputCache.set(node.id + '-result', { x: a.x + b.x, y: a.y + b.y });
},
'setVelocity': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    const velocity = context.evaluateInput(node.id, 'velocity', context);
    if (targetId && velocity) {
        context.setGameObjects(gos => gos.map(go => 
            go.id === targetId ? { ...go, velocity: { ...velocity } } : go
        ));
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'spawnObject': (node, context) => {
    const objectType = context.evaluateInput(node.id, 'objectType', context) || node.properties.objectType;
    const position = context.evaluateInput(node.id, 'position', context);
    if (objectType && position && context.engine.spawnGameObject) {
        const newObject = context.engine.spawnGameObject(objectType, position);
        context.nodeOutputCache.set(node.id + '-spawnedObject', newObject.id);
    } else {
        context.nodeOutputCache.set(node.id + '-spawnedObject', undefined);
        if (!context.engine.spawnGameObject) {
            context.addLog("[Error] spawnGameObject function not implemented in this context.");
        }
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'getText': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    let text = undefined;
    if (targetId) {
        const targetObject = context.gameObjects.find(go => go.id === targetId);
        if (targetObject) {
            const textRenderer = targetObject.behaviors.find(b => b.type === 'textRenderer');
            if (textRenderer) {
                text = textRenderer.properties.text;
            }
        }
    }
    context.nodeOutputCache.set(node.id + '-text', text);
},
'setText': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    const text = context.evaluateInput(node.id, 'text', context);
    if (targetId && typeof text === 'string') {
        context.setGameObjects(gos => gos.map(go => {
            if (go.id === targetId) {
                const rendererIndex = go.behaviors.findIndex(b => b.type === 'textRenderer');
                if (rendererIndex === -1) {
                    context.addLog('[Warning] Set Text: Target object \\'' + go.name + '\\' does not have a Text Renderer behavior.');
                    return go;
                }
                const newBehaviors = [...go.behaviors];
                const oldRenderer = newBehaviors[rendererIndex];
                newBehaviors[rendererIndex] = {
                    ...oldRenderer,
                    properties: {
                        ...oldRenderer.properties,
                        text: text,
                    }
                };
                return { ...go, behaviors: newBehaviors };
            }
            return go;
        }));
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'destroyObject': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    if (targetId) {
        context.setGameObjects(gos => gos.filter(go => go.id !== targetId));
    } else {
        context.addLog('[Warning] Destroy Object node was triggered but no target was provided.');
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'distance': (node, context) => {
    const a = context.evaluateInput(node.id, 'a', context) || {x:0,y:0};
    const b = context.evaluateInput(node.id, 'b', context) || {x:0,y:0};
    context.nodeOutputCache.set(node.id + '-distance', distance(a, b));
},
'countdownClock': (node, context) => {
    const { activeCountdowns } = context;
    if (!activeCountdowns) {
        context.addLog('[Error] Countdown clock feature not initialized in execution context.');
        return;
    }
    const duration = Number(node.properties.duration) || 60;
    if (context.triggeredPinId === 'start') {
        const targetId = node.properties.targetObjectId;
        if (!targetId) {
            context.addLog('[Warning] Countdown Clock (Node ID: ' + node.id + ') was started but no Target Text Object was selected in its properties.');
            return;
        }
        activeCountdowns.set(node.id, {
            nodeId: node.id,
            targetId,
            endTime: performance.now() + duration * 1000,
            duration,
            isFinished: false,
        });
        const initialFormattedTime = formatTime(duration);
        context.setGameObjects(gos => gos.map(go => {
            if (go.id === targetId) {
                const newGo = JSON.parse(JSON.stringify(go));
                const textRenderer = newGo.behaviors.find(b => b.type === 'textRenderer');
                if (textRenderer) {
                    textRenderer.properties.text = initialFormattedTime;
                }
                return newGo;
            }
            return go;
        }));
    } else if (context.triggeredPinId === 'stop') {
        activeCountdowns.delete(node.id);
    }
    const countdownState = activeCountdowns.get(node.id);
    if (countdownState) {
        const remainingMs = Math.max(0, countdownState.endTime - performance.now());
        context.nodeOutputCache.set(node.id + '-remainingSeconds', remainingMs / 1000);
    } else {
        context.nodeOutputCache.set(node.id + '-remainingSeconds', duration);
    }
},
'distanceCheck': (node, context) => {
    const objectAId = node.properties.objectAId;
    const objectBId = node.properties.objectBId;
    const thresholdDistance = Number(node.properties.distance) || 100;
    let isWithin = false;
    let actualDistance = Infinity;
    if (objectAId && objectBId) {
        const objectA = context.gameObjects.find(go => go.id === objectAId);
        const objectB = context.gameObjects.find(go => go.id === objectBId);
        if (objectA && objectB) {
            actualDistance = distance(objectA.position, objectB.position);
            if (actualDistance <= thresholdDistance) {
                isWithin = true;
            }
        } else {
             context.addLog('[Warning] Distance Check node: Could not find one or both objects (A: ' + objectAId + ', B: ' + objectBId + ')');
        }
    }
    context.nodeOutputCache.set(node.id + '-distance', actualDistance);
    context.triggerOutput(node.id, isWithin ? 'isWithin' : 'isNotWithin', context);
},
'musicChannel': (node, context) => {
    const { action, channel } = node.properties;
    const { musicChannels } = context;
    if (action === 'Stop Music on Channel') {
        const channelToStop = Number(channel) || 0;
        const audio = musicChannels.get(channelToStop);
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            musicChannels.delete(channelToStop);
        }
    } else if (action === 'Stop music on all channels') {
        musicChannels.forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
        musicChannels.clear();
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'health': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context), amount = context.evaluateInput(node.id, 'amount', context) ?? 10;
    const { action = 'Subtract', healthPropertyName = 'health', deathAnimationName = 'Death', hitAnimationName = 'Hit', healAnimationName = 'Heal', } = node.properties;
    if (targetId) {
        let died = false;
        context.setGameObjects(gos => gos.map(go => {
            if (go.id === targetId) {
                const newGo = JSON.parse(JSON.stringify(go));
                const script = newGo.behaviors.find(b => b.type === 'script');
                if (!script || typeof script.properties[healthPropertyName] !== 'number') {
                    context.addLog('[Warning] Modify Health: Target \\'' + go.name + '\\' has no script with a \\'' + healthPropertyName + '\\' number property.');
                    return go;
                }
                let newHealth = script.properties[healthPropertyName];
                let animationToPlay = null;
                if (action === 'Subtract') {
                    newHealth -= amount;
                    animationToPlay = hitAnimationName;
                } else {
                    newHealth += amount;
                    animationToPlay = healAnimationName;
                }
                if (newHealth <= 0 && action === 'Subtract') {
                    died = true;
                    if (deathAnimationName) animationToPlay = deathAnimationName;
                }
                script.properties[healthPropertyName] = newHealth;
                if (animationToPlay) {
                    newGo.currentAnimation = animationToPlay;
                    newGo.animationTime = 0;
                    newGo.currentFrame = 0;
                }
                return newGo;
            }
            return go;
        }));
        if (died) context.triggerOutput(node.id, 'onDeath', context);
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'flipObject': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context) || node.properties.targetObjectId;
    const flipDirection = node.properties.flipDirection || 'Horizontal';
    if (targetId) {
        context.setGameObjects(gos => gos.map(go => {
            if (go.id === targetId) {
                const newGo = JSON.parse(JSON.stringify(go));
                const transform = newGo.behaviors.find(b => b.type === 'transform');
                if (transform) {
                    if (flipDirection === 'Horizontal') transform.properties.scale.x *= -1;
                    else if (flipDirection === 'Vertical') transform.properties.scale.y *= -1;
                } else {
                    context.addLog('[Warning] Flip Object: Target \\'' + go.name + '\\' has no Transform behavior.');
                }
                return newGo;
            }
            return go;
        }));
    } else {
        context.addLog('[Warning] Flip Object node was triggered but no target was provided.');
    }
    context.triggerOutput(node.id, 'execOut', context);
},
'isFlipped': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context) || node.properties.targetObjectId;
    const axis = node.properties.axis || 'X';
    const checkIfFlipped = node.properties.checkIfFlipped === true;
    let finalResult = false;
    if (targetId) {
        const target = context.gameObjects.find(go => go.id === targetId);
        if (target) {
            const transform = target.behaviors.find(b => b.type === 'transform');
            if (transform) {
                const scale = transform.properties.scale || { x: 1, y: 1 };
                let isActuallyFlipped = axis === 'X' ? scale.x < 0 : scale.y < 0;
                finalResult = (isActuallyFlipped === checkIfFlipped);
            }
        }
    }
    context.nodeOutputCache.set(node.id + '-isFlipped', finalResult);
},
'positionCheck': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context) || node.properties.targetObjectId;
    if (!targetId) {
        context.addLog('[Warning] Position Check node: No target object specified.');
        context.triggerOutput(node.id, 'isFalse', context);
        return;
    }
    const target = context.gameObjects.find(go => go.id === targetId);
    if (!target) {
        context.addLog('[Warning] Position Check node: Target object with ID ' + targetId + ' not found.');
        context.triggerOutput(node.id, 'isFalse', context);
        return;
    }
    const { coordinate = 'X', operator = '>', value = 0 } = node.properties;
    const valueToCompare = coordinate === 'X' ? target.position.x : target.position.y;
    let result = false;
    switch (operator) { case '>': result = valueToCompare > value; break; case '<': result = valueToCompare < value; break; case '==': result = valueToCompare == value; break; }
    context.triggerOutput(node.id, result ? 'isTrue' : 'isFalse', context);
},
'comparePosition': (node, context) => {
    const objectAId = context.evaluateInput(node.id, 'objectA', context) || node.properties.objectAId;
    const objectBId = context.evaluateInput(node.id, 'objectB', context) || node.properties.objectBId;
    if (!objectAId || !objectBId) {
        context.nodeOutputCache.set(node.id + '-isRightOf', false);
        return;
    }
    const objectA = context.gameObjects.find(go => go.id === objectAId);
    const objectB = context.gameObjects.find(go => go.id === objectBId);
    if (!objectA || !objectB || !objectA.position || !objectB.position) {
        context.nodeOutputCache.set(node.id + '-isRightOf', false);
        return;
    }
    context.nodeOutputCache.set(node.id + '-isRightOf', objectA.position.x > objectB.position.x);
},
'keyboardPlatformerController': (node, context) => {
    const props = node.properties;
    const targetId = context.evaluateInput(node.id, 'target', context) || context.gameObjects.find(go => go.name === props.targetName)?.id;
    if (!targetId) {
        context.triggerOutput(node.id, 'execOut', context);
        return;
    }
    const leftKey = (props.leftKey || '').toLowerCase();
    const rightKey = (props.rightKey || '').toLowerCase();
    let jumpKey = (props.jumpKey || '').toLowerCase();
    if (jumpKey === 'space') jumpKey = ' ';
    const attacks = Array.from({ length: 6 }, (_, i) => i + 1).map(index => ({
        key: (props['attack' + index + 'Key'] || '')?.toLowerCase(),
        anim: props['attack' + index + 'Anim']
    })).filter(a => a.key && a.anim);
    const attackAnims = new Set(attacks.map(a => a.anim));
    const collidables = context.gameObjects.filter(go => go.type === 'platform' || go.type === 'hitbox');
    context.setGameObjects(gos => gos.map(go => {
        if (go.id !== targetId || !(go.isActive ?? true)) return go;
        const newGo = JSON.parse(JSON.stringify(go));
        newGo.prevPosition = go.position;
        const keysDownPreviously = go._attackState?.keysDownPreviously ?? new Set();
        const leftDown = !!context.keyboardState[leftKey];
        const rightDown = !!context.keyboardState[rightKey];
        const jumpDown = !!context.keyboardState[jumpKey];
        const wasJumpDown = keysDownPreviously.has(jumpKey);
        const jumpJustPressed = jumpDown && !wasJumpDown;
        const moveInput = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
        let isAttacking = false;
        let attackAnimToPlay = null;
        let newAttackTriggered = false;
        for (const attack of attacks) {
            if (!!context.keyboardState[attack.key] && !keysDownPreviously.has(attack.key)) {
                isAttacking = true;
                newAttackTriggered = true;
                attackAnimToPlay = attack.anim;
                break;
            }
        }
        if (!isAttacking) {
            const currentIsAttack = attackAnims.has(newGo.currentAnimation ?? '');
            if (currentIsAttack) {
                const currentClip = newGo.animations?.find(a => a.name === newGo.currentAnimation);
                const duration = currentClip ? currentClip.frames.length / (currentClip.fps || 10) : 0;
                if ((newGo.animationTime ?? 0) < duration) {
                    isAttacking = true;
                    attackAnimToPlay = newGo.currentAnimation;
                }
            }
        }
        newGo.velocity.y += props.gravity * context.deltaTime;
        if (isAttacking && newGo.isGrounded) { newGo.velocity.x = 0; } 
        else { newGo.velocity.x = moveInput * Math.abs(props.speed); }
        if (jumpJustPressed && newGo.isGrounded) { newGo.velocity.y = -props.jumpStrength; }
        if (moveInput !== 0) {
            const transform = newGo.behaviors.find(b => b.type === 'transform');
            if (transform) transform.properties.scale.x = Math.abs(transform.properties.scale.x) * moveInput;
        }
        const hDisplacement = { x: newGo.velocity.x * context.deltaTime, y: 0 };
        let nearestHCollision = { time: 1, normal: {x: 0, y: 0} };
        for (const staticGo of collidables) {
            if(staticGo.id === newGo.id) continue;
            const pCtrl = staticGo.behaviors.find(b => b.type === 'platformController')?.properties;
            if ((staticGo.type !== 'platform' || pCtrl?.collisionType !== 'solid') && staticGo.type !== 'hitbox') continue;
            for (const movingBox of getActiveHitboxes(newGo)) {
                for (const staticBox of getActiveHitboxes(staticGo)) {
                    const result = sweptAABB(movingBox, hDisplacement, staticBox);
                    if (result.time < nearestHCollision.time) nearestHCollision = result;
                }
            }
        }
        newGo.position.x += hDisplacement.x * nearestHCollision.time;
        if (nearestHCollision.time < 1) newGo.velocity.x = 0;
        newGo.isGrounded = false;
        let groundObject = null;
        const vDisplacement = { x: 0, y: newGo.velocity.y * context.deltaTime };
        let nearestVCollision = { time: 1, normal: {x: 0, y: 0} };
        for (const staticGo of collidables) {
            if(staticGo.id === newGo.id) continue;
            const pCtrl = staticGo.behaviors.find(b => b.type === 'platformController')?.properties;
            const isSolid = (staticGo.type === 'platform' && pCtrl?.collisionType === 'solid') || staticGo.type === 'hitbox';
            const isJumpthrough = staticGo.type === 'platform' && pCtrl?.collisionType === 'jumpthrough';
            if (!isSolid && !isJumpthrough) continue;
            for (const movingBox of getActiveHitboxes(newGo)) {
                for (const staticBox of getActiveHitboxes(staticGo)) {
                    const result = sweptAABB(movingBox, vDisplacement, staticBox);
                    if (isJumpthrough && result.normal.y !== -1) continue;
                    if (result.time < nearestVCollision.time) { nearestVCollision = result; if (result.normal.y === -1) groundObject = staticGo; }
                }
            }
        }
        newGo.position.y += vDisplacement.y * nearestVCollision.time;
        if (nearestVCollision.time < 1) {
            if (nearestVCollision.normal.y === -1) {
                newGo.isGrounded = true;
                if (groundObject && groundObject.velocity) newGo.position.x += groundObject.velocity.x * context.deltaTime;
            }
            newGo.velocity.y = 0;
        }
        let finalAnimation = newGo.currentAnimation;
        if (isAttacking && attackAnimToPlay) { finalAnimation = attackAnimToPlay; } 
        else if (!newGo.isGrounded) { finalAnimation = newGo.velocity.y > 0 ? props.fallAnim : props.jumpAnim; } 
        else if (moveInput !== 0) { finalAnimation = props.runAnim; } 
        else { finalAnimation = props.idleAnim; }
        if (finalAnimation && newGo.currentAnimation !== finalAnimation) {
            if (newGo.animations?.some(a => a.name === finalAnimation)) {
                newGo.currentAnimation = finalAnimation;
                newGo.animationTime = 0;
                newGo.currentFrame = 0;
            }
        } else if (newAttackTriggered && finalAnimation === newGo.currentAnimation) {
            newGo.animationTime = 0;
            newGo.currentFrame = 0;
        }
        const currentKeysDown = new Set();
        attacks.forEach(attack => { if (!!context.keyboardState[attack.key]) currentKeysDown.add(attack.key); });
        if (jumpDown) currentKeysDown.add(jumpKey);
        newGo._attackState = { keysDownPreviously: currentKeysDown };
        return newGo;
    }));
    context.triggerOutput(node.id, 'execOut', context);
},
'enemyAIPlatformer': (node, context) => {
    const targetId = context.evaluateInput(node.id, 'target', context);
    const playerId = context.evaluateInput(node.id, 'player', context) || context.gameObjects.find(g => g.name === (node.properties.targetName || 'Player'))?.id;
    if (targetId) {
        context.setGameObjects(gos => gos.map(go => {
            if (go.id === targetId) {
                const newGo = { ...go, aiControllerNodeId: node.id };
                if (!newGo.aiState) {
                    newGo.aiState = {
                        state: 'IDLE',
                        stateTimer: 0,
                        reactionTimer: 0,
                        attackCooldown: 0,
                        hitStunTimer: 0,
                        targetPlayerId: playerId,
                    };
                } else {
                    newGo.aiState.targetPlayerId = playerId;
                }
                return newGo;
            }
            return go;
        }));
    }
    context.triggerOutput(node.id, 'execOut', context);
},
        };
    }
}

// --- Game Initialization ---
const engine = new GameEngine();
const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');
const gameContainer = document.getElementById('game-container');
const canvas = document.getElementById('game-canvas');

const projectConfig = BLITZBOOM_DATA;
if (projectConfig?.resolution) {
    const res = projectConfig.resolution;
    canvas.width = res.width;
    canvas.height = res.height;
    gameContainer.style.width = res.width + 'px';
    gameContainer.style.height = res.height + 'px';
}

startButton.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    if (projectConfig.startFullscreen) {
        gameContainer.requestFullscreen().catch(err => {
            console.error('Fullscreen request failed: ' + err.message);
        }).finally(() => {
            engine.start();
        });
    } else {
        engine.start();
    }
}, { once: true });
`;
// Fix: Implement export service to package the project for web.
const dataURIToBlob = (dataURI: string): Blob => {
    const splitDataURI = dataURI.split(','),
        byteString = splitDataURI[0].includes('base64') ? atob(splitDataURI[1]) : decodeURI(splitDataURI[1]),
        mimeString = splitDataURI[0].split(':')[1].split(';')[0];
    const ia = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    return new Blob([ia], { type: mimeString });
};

const isMediaAsset = (asset: Asset): boolean => [AssetType.Image, AssetType.Audio, AssetType.Video, AssetType.Font].includes(asset.type);

export const exportProjectToHtml5 = async (
    projectData: ProjectDataForExport,
    options: ExportOptions,
    onProgress: (update: { step: string, status: 'running' | 'success' | 'error', log?: string }) => void
): Promise<ExportResult> => {
    try {
        onProgress({ step: 'Prepare Project Data', status: 'running', log: 'Cloning and sanitizing project data...' });
        // Deep clone to avoid modifying original project state
        const dataForExport = JSON.parse(JSON.stringify(projectData));
        const zip = new JSZip();
        onProgress({ step: 'Prepare Project Data', status: 'success', log: 'Project data prepared.' });
        
        onProgress({ step: 'Package Assets', status: 'running', log: 'Packaging assets...' });

        const assetsToProcess: Asset[] = [];
        const collectAssets = (assetList: Asset[]) => {
            for (const asset of assetList) {
                assetsToProcess.push(asset);
                if (asset.children) {
                    collectAssets(asset.children);
                }
            }
        };
        collectAssets(dataForExport.assets);
        
        const mediaAssets = assetsToProcess.filter(a => isMediaAsset(a) && a.data);
        onProgress({ step: 'Package Assets', status: 'running', log: `Found ${mediaAssets.length} media assets to package.`});

        for (const asset of assetsToProcess) {
            if (asset.path) {
                const zipPath = asset.path.startsWith('/') ? asset.path.substring(1) : asset.path;
                if (isMediaAsset(asset) && asset.data) {
                    zip.file(zipPath, dataURIToBlob(asset.data));
                }
                asset.path = zipPath; // Make all paths relative
            }
            delete asset.data; // Remove data from all assets for the final JSON
        }
        
        onProgress({ step: 'Package Assets', status: 'success', log: 'Assets packaged and data stripped.' });

        onProgress({ step: 'Add Game Engine', status: 'running', log: 'Generating runtime script...' });
        let runtimeJs = EXPORT_RUNTIME_JS.replace('/*DATA_PLACEHOLDER*/', JSON.stringify(dataForExport));
        
        if (options.minify) {
            // Fix: Corrected invalid regular expressions for minification.
            runtimeJs = runtimeJs.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
                                .replace(/\s*([=,;:{}\[\]()])\s*/g, '$1')
                                .replace(/\n\s*/g, '');
            onProgress({ step: 'Add Game Engine', status: 'running', log: 'Minified runtime script.' });
        }
        zip.file('runtime.js', runtimeJs);
        
        let indexHtml = EXPORT_HTML_TEMPLATE.replace(/<!--PROJECT_NAME_PLACEHOLDER-->/g, projectData.projectName);
        zip.file('index.html', indexHtml);
        onProgress({ step: 'Add Game Engine', status: 'success', log: 'Game engine and index file generated.' });

        if (options.createZip) {
            onProgress({ step: 'Generate ZIP', status: 'running', log: 'Compressing files into a ZIP package...' });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const downloadUrl = URL.createObjectURL(zipBlob);
            onProgress({ step: 'Generate ZIP', status: 'success', log: 'ZIP package created successfully.' });
            return { downloadUrl };
        }
        
        return {};
        
    } catch (e: any) {
        const errorStep = 'Generate ZIP'; // Assume failure at the last possible step for UI
        onProgress({ step: errorStep, status: 'error', log: `Error during export: ${e.message}` });
        // Set previous steps to success for a better visual representation of where it failed
        const steps = ['Prepare Project Data', 'Package Assets', 'Add Game Engine', 'Generate ZIP'];
        for (const step of steps) {
            if (step === errorStep) break;
            onProgress({ step, status: 'success' });
        }
        throw e;
    }
};