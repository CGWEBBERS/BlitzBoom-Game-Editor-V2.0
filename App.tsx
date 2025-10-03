import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Asset,
  AssetType,
  GameObject,
  Vector2,
  SelectedItems,
  GameObjectType,
  GraphNode,
  Connection,
  Layer,
  ObjectGroup,
  AnimationClip,
  SimulatedGameObject,
  Scene,
  AnimationFrame,
  CameraState,
  EntityType3D,
  TextRendererBehavior,
  ExportOptions,
  ExportResult,
} from './types';
import Header from './components/Header';
import SceneView from './components/SceneView';
import SceneView3D from './components/SceneView3D';
import AssetsPanel from './components/AssetsPanel';
import PropertiesPanel from './components/PropertiesPanel';
import NodeEditorPanel from './components/NodeEditorPanel';
import ObjectsPanel from './components/ObjectsPanel';
import LayersPanel from './components/LayersPanel';
import ObjectGroupsPanel from './components/ObjectGroupsPanel';
import GameLogPanel from './components/GameLogPanel';
import GamePreviewWindow from './components/GamePreviewWindow';
import AddObjectModal from './components/AddObjectModal';
import AddObjectModal3D from './components/AddObjectModal3D';
import AnimationPanel from './components/AnimationPanel';
import AIAssistant from './components/AIAssistant';
import ResolutionModal from './components/ResolutionModal';
import ManualModal from './components/ManualModal';
import IntroScene from './components/IntroScene'; // Import the new IntroScene
import ExportModal from './components/ExportModal';
import { NodeBlueprint } from './nodeBlueprints';
import { nodeLogic } from './services/nodeLogic';
import { CountdownState, NodeExecutionContext } from './services/nodeLogic/types';
import { updateEnemyAI } from './services/nodeLogic/enemyAIPlatformer';
import { exportProjectToHtml5 } from './services/exportService';


// Let TypeScript know that JSZip is available globally from the script tag in index.html
declare const JSZip: any;


const stringToHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
};

const generateHslColor = (id: string) => {
  const hash = stringToHash(id);
  const h = hash % 360;
  return `hsl(${h}, 70%, 50%)`; // Hue, Saturation, Lightness
};


// --- Mock Data and Utils ---

const platformerScriptContent = `
// BlitzBoom Platformer Script

/**
 * This script provides platformer physics for a game object.
 * Define editable properties using the @property tag below.
 * The editor will automatically parse these and display them in the Properties panel.
 *
 * property schema: { "name": "Display Name", "type": "number" | "boolean", "default": any }
 */

// @property { "name": "Gravity", "type": "number", "default": 1200 }
// @property { "name": "Jump Strength", "type": "number", "default": 600 }
// @property { "name": "Max Speed", "type": "number", "default": 250 }
// @property { "name": "Health", "type": "number", "default": 100 }
// @property { "name": "Can Shoot", "type": "boolean", "default": false }

// The game engine's simulation will read these properties at runtime.
// You can add your own game logic in this file for a more advanced pipeline.
`;

const playerControllerScriptContent = `
// BlitzBoom Player Controller Script

/**
 * @property { "name": "Movement Speed", "type": "number", "default": 200 }
 * @property { "name": "Jump Force", "type": "number", "default": 500 }
 * @property { "name": "Is Facing Right", "type": "boolean", "default": true }
 */

// Engine Hooks (for illustration - not executed)

// function onUpdate(gameObject, input, deltaTime) {
//   // Horizontal Movement
//   if (input.isKeyDown('d')) {
//     gameObject.velocity.x = this.movementSpeed;
//     this.isFacingRight = true;
//   } else if (input.isKeyDown('a')) {
//     gameObject.velocity.x = -this.movementSpeed;
//     this.isFacingRight = false;
//   } else {
//     gameObject.velocity.x = 0;
//   }
//
//   // Jumping
//   if (input.isKeyDown('space') && gameObject.isGrounded) {
//     gameObject.velocity.y = -this.jumpForce;
//   }
// }
`;

const damageOnTouchScriptContent = `
// BlitzBoom Damage On Touch Script

/**
 * @property { "name": "Damage Amount", "type": "number", "default": 10 }
 * @property { "name": "Target Group", "type": "string", "default": "Player" }
 * @property { "name": "Destroy On Hit", "type": "boolean", "default": true }
 */

// Engine Hooks (for illustration - not executed)

// function onCollisionEnter(gameObject, other) {
//   if (other.belongsToGroup(this.targetGroup)) {
//     const health = other.getProperty('health');
//     if (health !== undefined) {
//       other.setProperty('health', health - this.damageAmount);
//     }
//
//     if (this.destroyOnHit) {
//       gameObject.destroy();
//     }
//   }
// }
`;

const simplePatrolScriptContent = `
// BlitzBoom Simple Patrol Script

/**
 * @property { "name": "Patrol Speed", "type": "number", "default": 50 }
 * @property { "name": "Patrol Distance", "type": "number", "default": 150 }
 */

// Internal state (for illustration)
// let startPositionX;
// let direction = 1;

// function onStart(gameObject) {
//   startPositionX = gameObject.position.x;
// }

// function onUpdate(gameObject, input, deltaTime) {
//   gameObject.position.x += this.patrolSpeed * direction * deltaTime;
//
//   if (direction === 1 && gameObject.position.x >= startPositionX + this.patrolDistance) {
//     direction = -1;
//   } else if (direction === -1 && gameObject.position.x <= startPositionX) {
//     direction = 1;
//   }
// }
`;

const initialAssets: Asset[] = [
  {
    id: 'root',
    name: 'Assets',
    type: AssetType.Folder,
    path: '/',
    children: [
      { id: 'sprites-folder', name: 'Sprites', type: AssetType.Folder, path: '/Sprites', children: [] },
      { id: 'platforms-folder', name: 'Platforms', type: AssetType.Folder, path: '/Platforms', children: [] },
      { id: 'textures-folder', name: 'Textures', type: AssetType.Folder, path: '/Textures', children: [] },
      { id: 'audio-folder', name: 'Audio', type: AssetType.Folder, path: '/Audio', children: [] },
      { id: 'video-folder', name: 'Video', type: AssetType.Folder, path: '/Video', children: [] },
      { id: 'fonts-folder', name: 'Fonts', type: AssetType.Folder, path: '/Fonts', children: [] },
      { id: 'scripts-folder', name: 'Scripts', type: AssetType.Folder, path: '/Scripts', children: [
        { id: 'platformer-script', name: 'platformer.js', type: AssetType.Script, path: '/Scripts/platformer.js', data: platformerScriptContent },
        { id: 'player-controller-script', name: 'PlayerController.js', type: AssetType.Script, path: '/Scripts/PlayerController.js', data: playerControllerScriptContent },
        { id: 'damage-touch-script', name: 'DamageOnTouch.js', type: AssetType.Script, path: '/Scripts/DamageOnTouch.js', data: damageOnTouchScriptContent },
        { id: 'patrol-script', name: 'SimplePatrol.js', type: AssetType.Script, path: '/Scripts/SimplePatrol.js', data: simplePatrolScriptContent },
      ]}
    ]
  }
];

// Helper function to add an asset to the tree immutably
const addAssetToTree = (assets: Asset[], newAsset: Asset, parentPath: string): Asset[] => {
    return assets.map(asset => {
        if (asset.path === parentPath && asset.type === AssetType.Folder) {
            return {
                ...asset,
                children: [...(asset.children || []), newAsset],
            };
        }
        if (asset.children) {
            return {
                ...asset,
                children: addAssetToTree(asset.children, newAsset, parentPath),
            };
        }
        return asset;
    });
};

// Helper function to update an asset's name in the tree immutably
const updateAssetInTree = (assets: Asset[], assetId: string, newName: string): Asset[] => {
    return assets.map(asset => {
        if (asset.id === assetId) {
            const oldName = asset.name;
            const newPath = asset.path.substring(0, asset.path.length - oldName.length) + newName;
            return {
                ...asset,
                name: newName,
                path: newPath,
            };
        }
        if (asset.children) {
            return {
                ...asset,
                children: updateAssetInTree(asset.children, assetId, newName),
            };
        }
        return asset;
    });
};


// Helper function to ensure a folder path exists in the asset tree.
const ensurePath = (assets: Asset[], pathParts: string[], parentPath: string): Asset[] => {
    if (pathParts.length === 0) return assets;

    const [currentPart, ...rest] = pathParts;
    const currentFullPath = `${parentPath}/${currentPart}`;

    const existingFolder = assets.find(a => a.name === currentPart && a.type === AssetType.Folder);

    if (existingFolder) {
        // Folder exists, recurse into its children
        return assets.map(asset => {
            if (asset.id === existingFolder.id) {
                return {
                    ...asset,
                    children: ensurePath(asset.children || [], rest, currentFullPath)
                };
            }
            return asset;
        });
    } else {
        // Folder doesn't exist, create it and the rest of the path recursively
        const newFolder: Asset = {
            id: `asset-folder-${Date.now()}-${Math.random()}`,
            name: currentPart,
            type: AssetType.Folder,
            path: currentFullPath,
            children: ensurePath([], rest, currentFullPath)
        };
        return [...assets, newFolder];
    }
};

const createNewGameObject = (type: GameObjectType, position: Vector2, existingNames: string[], layer: string): GameObject => {
  const newId = `go-${Date.now()}`;
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
      name = `${baseName} ${counter}`;
      counter++;
  }

  const baseObject: Omit<GameObject, 'name' | 'type' | 'layer'> & { behaviors: any[] } = {
    id: newId,
    behaviors: [
      { type: 'transform', name: 'Transform', properties: { position, scale: { x: 1, y: 1 }, rotation: 0 } },
    ],
    animations: [],
    hitboxColor: generateHslColor(newId),
    isActive: true,
  };

  const scriptBehavior = { 
      type: 'script', 
      name: 'platformer.js', 
      properties: { 
          scriptAssetId: 'platformer-script', 
          ...Object.fromEntries(Object.entries(parseScriptProperties(platformerScriptContent)).map(([key, value]: [string, any]) => [key, value.default]))
      } 
  };
  
  const spriteRendererBehavior = { type: 'spriteRenderer', name: 'Sprite Renderer', properties: { assetId: null, renderMode: 'normal' as const } };

  const platformControllerBehavior = {
      type: 'platformController',
      name: 'Platform Controller',
      properties: {
          collisionType: 'solid',
          canGrab: false,
          moveDirection: 'None',
          moveSpeed: 50,
          moveDistance: 100,
          isVisible: true,
      }
  };

  const textRendererBehavior = {
    type: 'textRenderer',
    name: 'Text Renderer',
    properties: {
      text: 'New Text',
      font: 'sans-serif',
      size: 24,
      color: '#FFFFFF',
      style: 'normal',
      align: 'left',
      customFontAssetId: null,
    }
  };

  switch (type) {
    case 'sprite':
      return { ...baseObject, name: 'New Sprite', type, layer, behaviors: [...baseObject.behaviors, spriteRendererBehavior] };
    case 'tiled':
      const tiledSpriteRenderer = { 
          ...spriteRendererBehavior, 
          properties: { ...spriteRendererBehavior.properties, renderMode: 'tiled' as const, tileSize: { x: 32, y: 32 } } 
      };
      return { ...baseObject, name, type, layer, behaviors: [...baseObject.behaviors, tiledSpriteRenderer] };
    case 'platform':
      return { 
          ...baseObject, 
          name, 
          type, 
          layer, 
          behaviors: [...baseObject.behaviors, spriteRendererBehavior, platformControllerBehavior],
          useCustomHitboxes: false,
      };
    case 'background':
      const backgroundControllerBehavior = {
        type: 'backgroundController',
        name: 'Background Controller',
        properties: {
          zIndex: -100,
          parallaxSpeed: { x: 0.5, y: 0.5 }
        }
      };
      return { 
          ...baseObject, 
          name, 
          type, 
          layer, 
          behaviors: [...baseObject.behaviors, spriteRendererBehavior, backgroundControllerBehavior],
      };
    case 'player':
    case 'enemy':
      return { 
          ...baseObject, 
          name, 
          type,
          layer, 
          behaviors: [...baseObject.behaviors, spriteRendererBehavior, scriptBehavior],
      };
    case 'bullet':
        const bulletSpriteRenderer = { type: 'spriteRenderer', name: 'Sprite Renderer', properties: { assetId: null, renderMode: 'normal' } };
        const bulletTransform = { type: 'transform', name: 'Transform', properties: { position, scale: { x: 0.25, y: 0.25 }, rotation: 0 } };
        return { ...baseObject, name, type, layer, behaviors: [bulletTransform, bulletSpriteRenderer] };
    case 'text':
      return { ...baseObject, name, type, layer, behaviors: [...baseObject.behaviors, textRendererBehavior] };
    case 'hitbox':
      return { ...baseObject, name, type, layer, behaviors: baseObject.behaviors, color: '#34d399' };
    default:
      return { ...baseObject, name: 'Empty Object', type: 'empty', layer, behaviors: baseObject.behaviors };
  }
};

const parseScriptProperties = (scriptContent: string): Record<string, any> => {
    const properties: Record<string, any> = {};
    if (!scriptContent) return properties;

    const regex = /@property\s*(\{.*?\})/g;
    let match;
    while ((match = regex.exec(scriptContent)) !== null) {
        try {
            const jsonString = match[1];
            const propDef = JSON.parse(jsonString);
            const key = propDef.name.replace(/\s+/g, ' ').trim().split(' ').map((word: string, index: number) => index > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word.toLowerCase()).join('');
            properties[key] = propDef;
        } catch (e) {
            console.error('Failed to parse script property:', match[0], e);
        }
    }
    return properties;
};

type AppState = 'intro' | 'resolution' | 'editor';

interface TimerState {
    startTime: number;
    duration: number;
    loop: boolean;
}

interface VideoState {
    assetId: string;
    nodeId: string;
    isPlaying: boolean;
    loop: boolean;
    volume: number;
}

// --- Preview Simulation Helpers ---
const getActiveHitboxesForSim = (go: SimulatedGameObject) => {
    const transform = go.behaviors.find(b => b.type === 'transform')?.properties;
    
    const getBoundingBox = () => {
        if (!transform) {
             const width = 32;
             const height = 32;
             return { x: go.position.x - width / 2, y: go.position.y - height / 2, width, height };
        }
        const scale = transform.scale || { x: 1, y: 1 };
        const width = 32 * (scale.x || 1);
        const height = 32 * (scale.y || 1);
        return { x: go.position.x - width / 2, y: go.position.y - height / 2, width, height };
    };
    
    if (!go.useCustomHitboxes || !go.animations) {
        return [getBoundingBox()];
    }
    if (!transform) return [getBoundingBox()];

    const activeClip = go.animations.find(anim => anim.name === go.currentAnimation);
    if (!activeClip || activeClip.frames.length === 0) {
        return [getBoundingBox()];
    }

    const frameIndex = activeClip.syncHitboxes ? 0 : (go.currentFrame || 0);
    const currentFrame = activeClip.frames[frameIndex];
    if (!currentFrame || !currentFrame.hitboxes || currentFrame.hitboxes.length === 0) {
        return [getBoundingBox()];
    }

    const renderedSpriteWidth = 32 * (transform.scale?.x || 1);
    const renderedSpriteHeight = 32 * (transform.scale?.y || 1);
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

        const worldOffsetX = localHitboxCenterX * scaleX;
        const worldOffsetY = localHitboxCenterY * scaleY;
        
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

const aabbCollision = (rect1: {x:number,y:number,width:number,height:number}, rect2: {x:number,y:number,width:number,height:number}) => (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
);

const formatTime = (seconds: number): string => {
    const ceilSeconds = Math.ceil(seconds);
    const minutes = Math.floor(ceilSeconds / 60);
    const remainingSeconds = ceilSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

// Hook to find and load all font assets into the document
const useDynamicFontLoader = (assets: Asset[]) => {
    useEffect(() => {
        const fontAssets: Asset[] = [];
        const findFonts = (assetList: Asset[]) => {
            assetList.forEach(asset => {
                if (asset.type === AssetType.Font && asset.data) {
                    fontAssets.push(asset);
                }
                if (asset.children) findFonts(asset.children);
            });
        };
        findFonts(assets);

        // Keep track of fonts we've already added to avoid errors
        const loadedFontFamilies = new Set(Array.from(document.fonts).map(f => f.family));

        fontAssets.forEach(async (fontAsset) => {
            const fontName = fontAsset.id; // The name we will use in CSS and Canvas
            if (!loadedFontFamilies.has(fontName)) {
                try {
                    const fontFace = new FontFace(fontName, `url(${fontAsset.data})`);
                    await fontFace.load();
                    document.fonts.add(fontFace);
                } catch (e) {
                    console.error(`Failed to load font: ${fontAsset.name}`, e);
                }
            }
        });
    }, [assets]);
};


// Main App Component
const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>('intro');
    const [projectName, setProjectName] = useState('My BlitzBoom Game');
    const [resolution, setResolution] = useState<{ width: number; height: number } | null>(null);
    const [startFullscreen, setStartFullscreen] = useState(false);
    const [assets, setAssets] = useState<Asset[]>(initialAssets);
    
    // --- Scene Management State ---
    const [scenes, setScenes] = useState<Scene[]>([
        { id: 'scene-initial', name: 'Game Scene', type: '2d', gameObjects: [], layers: [{ name: 'Default', isVisible: true, isLocked: false }], activeLayerName: 'Default', nodes: [], connections: [] }
    ]);
    const [activeSceneId, setActiveSceneId] = useState<string>('scene-initial');
    
    // Derived state for the active scene
    const activeScene = scenes.find(s => s.id === activeSceneId)!;
    
    const setActiveScene = useCallback((updater: (scene: Scene) => Scene) => {
        setScenes(currentScenes => currentScenes.map(scene =>
            scene.id === activeSceneId ? updater(scene) : scene
        ));
    }, [activeSceneId]);

    const [objectGroups, setObjectGroups] = useState<ObjectGroup[]>([]);
    const [selectedItems, setSelectedItems] = useState<SelectedItems>(null);
    const [activeView, setActiveView] = useState<'Game Scene' | 'Events'>('Game Scene');
    
    // UI states
    const [isShowingAddObjectModal, setIsShowingAddObjectModal] = useState(false);
    const [isShowingAddObjectModal3D, setIsShowingAddObjectModal3D] = useState(false);
    const [editingAnimationsFor, setEditingAnimationsFor] = useState<GameObject | null>(null);
    const [parsedScripts, setParsedScripts] = useState<Record<string, any>>({});
    const [isShowingManual, setIsShowingManual] = useState(false);
    const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [showHitboxes, setShowHitboxes] = useState(false);
    const previewAudioPlayersRef = useRef<Map<string, HTMLAudioElement>>(new Map());
    const previewMusicChannelsRef = useRef<Map<number, HTMLAudioElement>>(new Map());
    const projectLoadInputRef = useRef<HTMLInputElement>(null);
    
    // Simulation states
    const [previewingScene, setPreviewingScene] = useState<Scene | null>(null);
    const [isPreviewFullscreen, setPreviewFullscreen] = useState(false);
    const [liveSimObjects, setLiveSimObjects] = useState<SimulatedGameObject[]>([]);
    const [liveCameraState, setLiveCameraState] = useState<CameraState>({ position: { x: 0, y: 0 }, zoom: 1 });
    const [liveVideoState, setLiveVideoState] = useState<VideoState | null>(null);
    const [gameLogs, setGameLogs] = useState<string[]>(['Welcome to BlitzBoom!']);
    const clickedObjectIdRef = useRef<string | null>(null);

    // Call the hook to load custom fonts globally
    useDynamicFontLoader(assets);

    const addLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setGameLogs(prev => [...prev.slice(-100), `[${timestamp}] ${message}`]);
    }, []);

    const handleNewScene = useCallback(() => {
        const newSceneId = `scene-${Date.now()}`;
        let sceneName = `New Scene`;
        let counter = 1;
        while(scenes.some(s => s.name === sceneName)) {
            sceneName = `New Scene ${counter++}`;
        }

        const newScene: Scene = {
            id: newSceneId,
            name: sceneName,
            type: activeScene.type, // Create new scene of the same type
            gameObjects: [],
            layers: [{ name: 'Default', isVisible: true, isLocked: false }],
            activeLayerName: 'Default',
            nodes: [],
            connections: []
        };

        setScenes(s => [...s, newScene]);
        setActiveSceneId(newSceneId);
    }, [scenes, activeScene]);

    const handleSelectScene = (sceneId: string) => {
        setActiveSceneId(sceneId);
        const newSelection: SelectedItems = { type: 'scene', ids: [sceneId] };
        setSelectedItems(newSelection);
    };

    const handleRenameScene = (sceneId: string, newName: string) => {
        setScenes(scenes => scenes.map(s => s.id === sceneId ? { ...s, name: newName } : s));
    };

    const handleDeleteScene = (sceneId: string) => {
        if (scenes.length <= 1) {
            addLog("Cannot delete the last scene.");
            return;
        }
        const sceneToDelete = scenes.find(s => s.id === sceneId);
        if (!sceneToDelete) return;
    
        const confirmed = window.confirm(`Are you sure you want to delete the scene "${sceneToDelete.name}"? This cannot be undone.`);
        if (!confirmed) return;
    
        const newScenes = scenes.filter(s => s.id !== sceneId);
        const isDeletingActiveScene = activeSceneId === sceneId;
        const nextActiveSceneId = isDeletingActiveScene ? (newScenes[0]?.id || '') : activeSceneId;
        const nextSelectedItems: SelectedItems = isDeletingActiveScene ? (nextActiveSceneId ? { type: 'scene', ids: [nextActiveSceneId] } : null) : selectedItems;
    
        setScenes(newScenes);
        setActiveSceneId(nextActiveSceneId);
        setSelectedItems(nextSelectedItems);
        addLog(`Scene "${sceneToDelete.name}" deleted.`);
    };
    
    const handleReorderScenes = (dragIndex: number, hoverIndex: number) => {
      setScenes(prevScenes => {
        const newScenes = [...prevScenes];
        const [draggedItem] = newScenes.splice(dragIndex, 1);
        newScenes.splice(hoverIndex, 0, draggedItem);
        return newScenes;
      });
    };
    
    useEffect(() => {
        const scripts: Record<string, any> = {};
        function findScripts(assetList: Asset[]) {
            for (const asset of assetList) {
                if (asset.type === AssetType.Script && asset.data) {
                    scripts[asset.id] = parseScriptProperties(asset.data);
                }
                if (asset.children) {
                    findScripts(asset.children);
                }
            }
        }
        findScripts(assets);
        setParsedScripts(scripts);
    }, [assets]);

    // Delete selected items with Delete/Backspace key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            const activeEl = document.activeElement;
            if (activeEl && ['INPUT', 'TEXTAREA'].includes(activeEl.tagName)) return;
            if (!selectedItems || selectedItems.ids.length === 0) return;
            e.preventDefault();

            switch (selectedItems.type) {
                case 'gameobject':
                    setActiveScene(scene => ({
                        ...scene,
                        gameObjects: scene.gameObjects.filter(go => !selectedItems.ids.includes(go.id))
                    }));
                    setSelectedItems(null);
                    break;
                case 'node':
                    const idsToDelete = new Set(selectedItems.ids);
                    setActiveScene(scene => ({
                        ...scene,
                        nodes: scene.nodes.filter(n => !idsToDelete.has(n.id)),
                        connections: scene.connections.filter(c => !idsToDelete.has(c.fromNodeId) && !idsToDelete.has(c.toNodeId))
                    }));
                    setSelectedItems(null);
                    break;
                case 'scene':
                    handleDeleteScene(selectedItems.ids[0]);
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedItems, setActiveScene, handleDeleteScene]);

    const handleGameObjectUpdate = useCallback((updatedObject: GameObject) => {
        setActiveScene(scene => ({
            ...scene,
            gameObjects: scene.gameObjects.map(go => go.id === updatedObject.id ? updatedObject : go)
        }));
    }, [setActiveScene]);

    const handleNodeUpdate = useCallback((updatedNode: GraphNode) => {
        setActiveScene(scene => ({
            ...scene,
            nodes: scene.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
        }));
    }, [setActiveScene]);
    
    const handleSelectionChange = useCallback((selection: SelectedItems, options?: { addToSelection: boolean }) => {
        if (!options?.addToSelection) {
            setSelectedItems(selection);
            return;
        }
        setSelectedItems(prev => {
            if (!prev || !selection || prev.type !== selection.type) return selection;
            const newIds = [...new Set([...prev.ids, ...selection.ids])];
            return { type: prev.type, ids: newIds };
        });
    }, []);

    const handleCreateSprite = useCallback((asset: Asset, position: Vector2) => {
        const newSprite = createNewGameObject('sprite', position, activeScene.gameObjects.map(go => go.name), activeScene.activeLayerName);
        newSprite.name = asset.name.replace(/\..*$/, '');
        const spriteRenderer = newSprite.behaviors.find(b => b.type === 'spriteRenderer');
        if (spriteRenderer) spriteRenderer.properties.assetId = asset.id;
        setActiveScene(scene => ({ ...scene, gameObjects: [...scene.gameObjects, newSprite] }));
        const selection: SelectedItems = { type: 'gameobject', ids: [newSprite.id] };
        setSelectedItems(selection);
    }, [activeScene.gameObjects, activeScene.activeLayerName, setActiveScene]);

    const handleAddGameObject = useCallback((type: GameObjectType) => {
        const newObject = createNewGameObject(type, { x: 0, y: 0 }, activeScene.gameObjects.map(go => go.name), activeScene.activeLayerName);
        let newAssetsState = assets;
        if (type === 'player' || type === 'enemy') {
            const objectFolder: Asset = { id: `asset-${Date.now()}`, name: newObject.name, type: AssetType.Folder, path: `/Sprites/${newObject.name}`, children: [] };
            newAssetsState = addAssetToTree(newAssetsState, objectFolder, '/Sprites');
        }
        setAssets(newAssetsState);
        setActiveScene(scene => ({ ...scene, gameObjects: [...scene.gameObjects, newObject] }));
        setIsShowingAddObjectModal(false);
        const selection: SelectedItems = { type: 'gameobject', ids: [newObject.id] };
        setSelectedItems(selection);
    }, [assets, activeScene.gameObjects, activeScene.activeLayerName, setActiveScene]);

    const handleAddGameObject3D = useCallback((entityType: EntityType3D, gridPosition: Vector2, zIndex: number = 0) => {
        const newId = `go-${Date.now()}`;
        let baseName = entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let name = baseName;
        let counter = 1;
        while(activeScene.gameObjects.some(go => go.name === name)) {
            name = `${baseName} ${counter++}`;
        }
        const newObject: GameObject = {
            id: newId,
            name,
            type: 'empty', // 3D objects don't use the 2D types
            layer: activeScene.activeLayerName,
            behaviors: [],
            entityType3D: entityType,
            gridPosition,
            zIndex,
            hitboxColor: generateHslColor(newId),
            isActive: true,
        };

        if (entityType === 'player_start') {
          newObject.player3dConfig = {
            cameraType: 'first_person',
            mouseLook: true,
            speed: 100,
            size: { x: 20, y: 40, z: 20 },
            position: { x: gridPosition.x * 32, y: zIndex * 32 + 20, z: gridPosition.y * 32 },
            rotation: { x: 0, y: 0, z: 0 },
          };
        }

        setActiveScene(scene => ({ ...scene, gameObjects: [...scene.gameObjects, newObject] }));
        setIsShowingAddObjectModal3D(false);
        const selection: SelectedItems = { type: 'gameobject', ids: [newObject.id] };
        setSelectedItems(selection);
    }, [activeScene.gameObjects, activeScene.activeLayerName, setActiveScene]);


    const handleSaveAnimations = useCallback((gameObjectId: string, animations: AnimationClip[]) => {
        // Perform a deep copy as a robust safeguard against any potential shared references from the editor panel.
        const animationsCopy = JSON.parse(JSON.stringify(animations));
        const targetGameObject = activeScene.gameObjects.find(go => go.id === gameObjectId);
        if (!targetGameObject) return;

        let currentAssets = assets;
        animationsCopy.forEach(clip => {
            if (clip.frames.some(f => f.spriteSrc && !f.spriteAssetId)) {
                const parentPath = `/Sprites/${targetGameObject.name}/${clip.name}`;
                const pathParts = parentPath.split('/').filter(p => p);
                
                const root = currentAssets[0];
                const newChildren = ensurePath(root.children || [], pathParts, '');
                currentAssets = [{...root, children: newChildren}];
            }
        });

        const newAnimations = animationsCopy.map(clip => {
            const newFrames = clip.frames.map((frame, index) => {
                if (frame.spriteSrc && !frame.spriteAssetId) {
                    const parentPath = `/Sprites/${targetGameObject.name}/${clip.name}`;
                    const newAssetName = frame.name || `frame_${Date.now()}_${index}.png`;
                    const newAsset: Asset = { id: `asset-${Date.now()}-${index}`, name: newAssetName, type: AssetType.Image, path: `${parentPath}/${newAssetName}`, data: frame.spriteSrc };
                    currentAssets = addAssetToTree(currentAssets, newAsset, parentPath);
                    
                    const { spriteSrc, name, ...restOfFrame } = frame;
                    return { ...restOfFrame, spriteAssetId: newAsset.id };
                }
                const { name: tempName, ...restOfFrameWithoutTempName } = frame;
                return restOfFrameWithoutTempName;
            });
            return { ...clip, frames: newFrames };
        });

        setAssets(currentAssets);
        setActiveScene(scene => ({ ...scene, gameObjects: scene.gameObjects.map(go => go.id === gameObjectId ? { ...go, animations: newAnimations } : go) }));
        setEditingAnimationsFor(null);
    }, [assets, activeScene.gameObjects, setActiveScene]);
    
    const handleUpdateAsset = useCallback((assetId: string, newNameWithoutExtension: string) => {
        let assetToUpdate: Asset | null = null;
        let parent: Asset | null = null;

        function find(current: Asset, p: Asset | null): boolean {
            if (current.id === assetId) {
                assetToUpdate = current;
                parent = p;
                return true;
            }
            if (current.children) {
                for (const child of current.children) {
                    if (find(child, current)) return true;
                }
            }
            return false;
        }

        find(assets[0], null);

        if (!assetToUpdate || !parent || !parent.children) {
            console.error("Could not find asset or its parent to rename.");
            return;
        }

        const oldExtension = assetToUpdate.name.includes('.') ? assetToUpdate.name.split('.').pop() : '';
        let finalNewName = newNameWithoutExtension;
        if (oldExtension) {
            finalNewName = `${newNameWithoutExtension}.${oldExtension}`;
        }

        if (parent.children.some(sibling => sibling.id !== assetId && sibling.name === finalNewName)) {
            alert(`An asset with the name "${finalNewName}" already exists in this folder.`);
            return;
        }
    
        setAssets(currentAssets => updateAssetInTree(currentAssets, assetId, finalNewName));
    }, [assets]);

    const onTextureAssigned = useCallback((gameObjectId: string, face: string, fileData: string, fileName: string) => {
        const newAsset: Asset = {
            id: `asset-tex-${Date.now()}`,
            name: fileName,
            type: AssetType.Image,
            path: `/Textures/${fileName}`,
            data: fileData,
        };
        setAssets(prev => addAssetToTree(prev, newAsset, '/Textures'));
        setActiveScene(scene => ({
            ...scene,
            gameObjects: scene.gameObjects.map(go => {
                if (go.id === gameObjectId) {
                    const newGo = { ...go, textures: { ...go.textures, [face]: newAsset.id } };
                    return newGo;
                }
                return go;
            })
        }));
    }, [setActiveScene]);

    const handleAssetCreateForGameObject = useCallback((gameObjectId: string, behaviorType: string, propertyName: string, fileData: string, fileName: string) => {
        const go = activeScene.gameObjects.find(g => g.id === gameObjectId);
        if (!go) return;

        let assetType: AssetType;
        let parentPath: string;

        if (behaviorType === 'textRenderer' && propertyName === 'customFontAssetId') {
            assetType = AssetType.Font;
            parentPath = '/Fonts';
        } else { // Default to image for spriteRenderer etc.
            assetType = AssetType.Image;
            parentPath = '/Sprites'; // A sensible default folder
        }
        
        const newAsset: Asset = { id: `asset-${Date.now()}`, name: fileName, type: assetType, path: `${parentPath}/${fileName}`, data: fileData };
        
        const newAssetsState = addAssetToTree(assets, newAsset, parentPath);
        setAssets(newAssetsState);

        setActiveScene(scene => ({ ...scene, gameObjects: scene.gameObjects.map(g => {
            if (g.id === gameObjectId) {
                const newBehaviors = g.behaviors.map(b => {
                    if (b.type === behaviorType) {
                        if (assetType === AssetType.Font) {
                            return { 
                                ...b, 
                                properties: { 
                                    ...b.properties, 
                                    customFontAssetId: newAsset.id,
                                    font: newAsset.name,
                                } 
                            };
                        }
                        return { ...b, properties: { ...b.properties, [propertyName]: newAsset.id } };
                    }
                    return b;
                });
                return { ...g, behaviors: newBehaviors };
            }
            return g;
        })}));
    }, [assets, activeScene.gameObjects, setActiveScene]);

    const handleAssetCreateForNode = useCallback((nodeId: string, propertyName: string, fileData: string, fileName: string) => {
        const node = activeScene.nodes.find(n => n.id === nodeId);
        if (!node) return;
        let assetType: AssetType, parentFolder: string;
        switch(node.type) {
            case 'playMusic': case 'sounds': assetType = AssetType.Audio; parentFolder = '/Audio'; break;
            case 'playVideo': assetType = AssetType.Video; parentFolder = '/Video'; break;
            default: addLog(`Error: Asset creation is not supported for ${node.name} nodes.`); return;
        }
        const newAsset: Asset = { id: `asset-${Date.now()}`, name: fileName, type: assetType, path: `${parentFolder}/${fileName}`, data: fileData };
        setAssets(addAssetToTree(assets, newAsset, parentFolder));
        handleNodeUpdate({ ...node, properties: { ...node.properties, [propertyName]: newAsset.id } });
        addLog(`Created new asset: ${fileName}`);
    }, [assets, activeScene.nodes, handleNodeUpdate, addLog]);
    
    const handleAddConnection = useCallback((connection: Omit<Connection, 'id'>) => {
        setActiveScene(scene => ({ ...scene, connections: [...scene.connections, { ...connection, id: `conn-${Date.now()}` }] }));
    }, [setActiveScene]);

    const handleAddNode = useCallback((blueprint: NodeBlueprint, position: Vector2) => {
        const newNode: GraphNode = { id: `node-${Date.now()}`, type: blueprint.type, name: blueprint.name, position, inputs: JSON.parse(JSON.stringify(blueprint.inputs)), outputs: JSON.parse(JSON.stringify(blueprint.outputs)), properties: JSON.parse(JSON.stringify(blueprint.properties)) };
        setActiveScene(scene => ({ ...scene, nodes: [...scene.nodes, newNode] }));
    }, [setActiveScene]);

    const handleDeleteLayer = (layerName: string) => {
        if (layerName === 'Default') { alert("The 'Default' layer cannot be deleted."); return; }
        if (window.confirm(`Are you sure you want to delete the layer "${layerName}"? Objects on this layer will be moved to 'Default'.`)) {
            setActiveScene(scene => ({
                ...scene,
                gameObjects: scene.gameObjects.map(go => go.layer === layerName ? { ...go, layer: 'Default' } : go),
                activeLayerName: scene.activeLayerName === layerName ? 'Default' : scene.activeLayerName,
                layers: scene.layers.filter(l => l.name !== layerName),
            }));
        }
    };

    // --- Project Save/Load/Menu ---
    const handleNewProject = () => {
        if (window.confirm('Are you sure? All unsaved changes will be lost.')) {
            setProjectName('My BlitzBoom Game');
            setResolution(null);
            setStartFullscreen(false);
            setAssets(initialAssets);
            setScenes([ { id: 'scene-initial', name: 'Game Scene', type: '2d', gameObjects: [], layers: [{ name: 'Default', isVisible: true, isLocked: false }], activeLayerName: 'Default', nodes: [], connections: [] } ]);
            setActiveSceneId('scene-initial');
            setObjectGroups([]);
            setSelectedItems(null);
            setGameLogs(['Welcome to BlitzBoom!']);
            setAppState('resolution');
        }
    };

    const handleProjectSettings = () => setIsProjectSettingsOpen(true);

    const dataURIToBlob = (dataURI: string): Blob => {
        const splitDataURI = dataURI.split(','), byteString = splitDataURI[0].includes('base64') ? atob(splitDataURI[1]) : decodeURI(splitDataURI[1]), mimeString = splitDataURI[0].split(':')[1].split(';')[0];
        const ia = new Uint8Array(byteString.length); for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i); return new Blob([ia], { type: mimeString });
    };

    const handleSaveProject = async () => {
        addLog('Packaging project...');
        try {
            const zip = new JSZip();
            const assetsForSave = JSON.parse(JSON.stringify(assets));
            const allFileAssets: Asset[] = [];
            const collectFileAssets = (assetList: Asset[]) => { for (const asset of assetList) { if (asset.type !== 'folder' && asset.data) allFileAssets.push(asset); if (asset.children) collectFileAssets(asset.children); } };
            collectFileAssets(assetsForSave);
            for (const asset of allFileAssets) { if (asset.path && asset.data) { zip.file(`assets${asset.path}`, dataURIToBlob(asset.data)); delete asset.data; } }
            const projectData = { version: 2, projectName, resolution, startFullscreen, assets: assetsForSave, scenes, activeSceneId, objectGroups };
            zip.file('project.blitzboom.json', JSON.stringify(projectData, null, 2));
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a'); link.href = URL.createObjectURL(zipBlob); link.download = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(link.href);
            addLog('Project saved successfully.');
        } catch (err: any) { addLog(`Error saving project: ${err.message}`); }
    };

    const handleLoadProjectTrigger = () => projectLoadInputRef.current?.click();
    
    const handleLoadProjectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return; addLog(`Loading project from '${file.name}'...`);
        try {
            const zip = await JSZip.loadAsync(file), projectFileArray = zip.file(/project\.blitzboom\.json$/);
            if (projectFileArray.length === 0) throw new Error('Could not find project.blitzboom.json in the zip file.');
            const projectData = JSON.parse(await projectFileArray[0].async('string'));
            if (!projectData.version || projectData.version < 2) {
                projectData.scenes = [{ id: 'scene-initial', name: 'Game Scene', type: '2d', gameObjects: projectData.gameObjects || [], layers: projectData.layers || [{ name: 'Default', isVisible: true, isLocked: false }], activeLayerName: projectData.activeLayerName || 'Default', nodes: projectData.nodes || [], connections: projectData.connections || [] }];
                projectData.activeSceneId = 'scene-initial';
                ['gameObjects', 'layers', 'activeLayerName', 'nodes', 'connections'].forEach(k => delete projectData[k]); addLog('Migrated legacy project to scene format.');
            }
            if (!projectData || !projectData.scenes) throw new Error('Invalid project file.');

            // Ensure all game objects have a hitbox color
            projectData.scenes.forEach((scene: Scene) => {
              scene.gameObjects.forEach(go => {
                if (!go.hitboxColor) {
                  go.hitboxColor = generateHslColor(go.id);
                }
              });
            });

            const assetPromises: Promise<void>[] = [];
            const processAssetsFromZip = (assetList: Asset[]) => { for (const asset of assetList) { if (asset.type === 'folder' && asset.children) processAssetsFromZip(asset.children); else if (asset.path && (asset.type === AssetType.Image || asset.type === AssetType.Audio || asset.type === AssetType.Video || asset.type === AssetType.Font)) { const assetFile = zip.file(`assets${asset.path}`); if (assetFile) assetPromises.push(assetFile.async('base64').then((base64: string) => { const ext = asset.name.split('.').pop()?.toLowerCase() || '', mime = {'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','mp3':'audio/mpeg','wav':'audio/wav','ogg':'audio/ogg','mp4':'video/mp4','webm':'video/webm','ttf':'font/ttf','otf':'font/otf'}[ext]||'application/octet-stream'; asset.data = `data:${mime};base64,${base64}`; })); } } };
            if (projectData.assets[0]?.children) processAssetsFromZip(projectData.assets[0].children);
            await Promise.all(assetPromises);
            setProjectName(projectData.projectName || 'My BlitzBoom Game'); setResolution(projectData.resolution || { width: 1280, height: 720 }); setStartFullscreen(projectData.startFullscreen || false); setAssets(projectData.assets || initialAssets); setScenes(projectData.scenes || []); setActiveSceneId(projectData.activeSceneId || projectData.scenes[0]?.id); setObjectGroups(projectData.objectGroups || []); setSelectedItems(null); setAppState('editor'); addLog('Project loaded successfully.');
        } catch (err: any) { addLog(`Error loading project: ${err.message}`); } finally { if (e.target) e.target.value = ''; }
    };

    const handleExportProject = async (options: ExportOptions, onProgress: (update: { step: string, status: 'running' | 'success' | 'error', log?: string }) => void): Promise<ExportResult> => {
        const projectDataForExport = {
            projectName,
            resolution,
            startFullscreen,
            assets,
            scenes,
            initialSceneId: scenes[0]?.id || activeSceneId,
        };
        
        return exportProjectToHtml5(projectDataForExport, options, onProgress);
    };

    const evaluateInput = useCallback((nodeId: string, pinId: string, context: NodeExecutionContext): any => {
        const connection = context.connections.find(c => c.toNodeId === nodeId && c.toInputId === pinId); if (!connection) return undefined;
        const sourceNode = context.nodes.find(n => n.id === connection.fromNodeId);
        if (sourceNode) { const cacheKey = `${sourceNode.id}-${connection.fromOutputId}`; if (context.nodeOutputCache.has(cacheKey)) return context.nodeOutputCache.get(cacheKey); const logic = nodeLogic[sourceNode.type]; if (logic) { logic(sourceNode, context); return context.nodeOutputCache.get(cacheKey); } } return undefined;
    }, []);
    
    const triggerOutput = useCallback((nodeId: string, pinId: string, context: NodeExecutionContext) => {
        const connections = context.connections.filter(c => c.fromNodeId === nodeId && c.fromOutputId === pinId);
        for(const connection of connections) { const nextNode = context.nodes.find(n => n.id === connection.toNodeId); if (nextNode) { const logic = nodeLogic[nextNode.type]; if (logic) logic(nextNode, { ...context, triggeredPinId: connection.toInputId }); } }
    }, []);

    const handlePreview = () => {
        if (scenes[0]) {
            setPreviewingScene(scenes[0]);
            if (startFullscreen) {
                setPreviewFullscreen(true);
            }
        } else {
            addLog("Cannot start preview: No scenes exist.");
        }
    };
    const stopPreview = () => {
        previewAudioPlayersRef.current.forEach(p => { p.pause(); p.currentTime = 0; });
        previewAudioPlayersRef.current.clear();
        previewMusicChannelsRef.current.forEach(p => { p.pause(); p.currentTime = 0; });
        previewMusicChannelsRef.current.clear();
        setPreviewingScene(null);
        setPreviewFullscreen(false);
    };
    
    useEffect(() => {
        if (!previewingScene) return;
        setLiveSimObjects([]); setLiveVideoState(null); setLiveCameraState({ position: { x: 0, y: 0 }, zoom: 1 }); addLog(`Starting simulation for scene: ${previewingScene.name}`);
        let gameLoopId = 0, keyboardState: Record<string, boolean> = {}, audioPlayers = new Map<string, HTMLAudioElement>(), musicChannels = new Map<number, HTMLAudioElement>(), videoState: VideoState | null = null, cameraState: CameraState = { position: { x: 0, y: 0 }, zoom: 1 }, activeTimers = new Map<string, TimerState>(), activeCountdowns = new Map<string, CountdownState>(), triggeredOnceNodes = new Set<string>(), lastFrameTime = 0, isPaused = false;
        let simulatedObjects: SimulatedGameObject[] = JSON.parse(JSON.stringify(previewingScene.gameObjects)).map((go: GameObject) => { const t = go.behaviors.find(b => b.type === 'transform'), p = t ? { ...t.properties.position } : { x: 0, y: 0 }; return { ...go, position: p, velocity: { x: 0, y: 0 }, initialPosition: p, patrolTime: 0, prevPosition: p, currentAnimation: 'Idle', animationTime: 0, animationSpeed: 1, currentFrame: 0, isActive: go.isActive ?? true }; });
        const findAudioAssets = (assetList: Asset[]) => { for (const asset of assetList) { if (asset.type === AssetType.Audio && asset.data) audioPlayers.set(asset.id, new Audio(asset.data)); if (asset.children) findAudioAssets(asset.children); } };
        previewAudioPlayersRef.current = audioPlayers;
        previewMusicChannelsRef.current = musicChannels;
        findAudioAssets(assets);
        const spawnGameObject = (type: GameObjectType, position: Vector2): SimulatedGameObject => { const newObj = createNewGameObject(type, position, simulatedObjects.map(go => go.name), activeScene.activeLayerName); const simObj: SimulatedGameObject = { ...newObj, position, velocity: { x: 0, y: 0 }, initialPosition: position, patrolTime: 0, prevPosition: position, isGrounded: false, currentAnimation: null, animationTime: 0, animationSpeed: 1, currentFrame: 0, isActive: true }; simulatedObjects.push(simObj); return simObj; };
        const engine = { loadScene: (id: string) => { const s = scenes.find(s => s.id === id); if (s) { addLog(`Node triggered scene change to: ${s.name}`); setPreviewingScene(s); } else addLog(`Error: Scene with ID ${id} not found.`); }, pause: () => isPaused = true, resume: () => isPaused = false, togglePause: () => isPaused = !isPaused, spawnGameObject };
        const executeGraph = (type: 'onStart' | 'onUpdate', ctx: Omit<NodeExecutionContext, 'nodes'|'connections'>) => { const fullCtx = { ...ctx, nodes: previewingScene.nodes, connections: previewingScene.connections }; previewingScene.nodes.filter(n => n.type === type).forEach(node => triggerOutput(node.id, 'execOut', fullCtx)); };
        const currentLogs: string[] = []; const addLogProxy = (msg: string) => currentLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`); const setSimProxy = (a: React.SetStateAction<SimulatedGameObject[]>) => simulatedObjects = typeof a === 'function' ? a(simulatedObjects) : a; const setVidProxy = (a: React.SetStateAction<VideoState | null>) => videoState = typeof a === 'function' ? a(videoState) : a; const setCamProxy = (a: React.SetStateAction<CameraState>) => cameraState = typeof a === 'function' ? a(cameraState) : a;
        const baseContext: Omit<NodeExecutionContext, 'nodes'|'connections'|'deltaTime'|'nodeOutputCache'> = { engine, gameObjects: simulatedObjects, keyboardState, audioPlayers, musicChannels, videoState, cameraState, activeTimers, activeCountdowns, triggeredOnceNodes, setGameObjects: setSimProxy, setVideoState: setVidProxy, setCameraState: setCamProxy, addLog: addLogProxy, evaluateInput, triggerOutput, setPreviewFullscreen };
        executeGraph('onStart', { ...baseContext, deltaTime: 0, nodeOutputCache: new Map() });
        setLiveSimObjects([...simulatedObjects]); setLiveVideoState(videoState); setLiveCameraState(cameraState); if (currentLogs.length > 0) setGameLogs(prev => [...prev.slice(-100), ...currentLogs]); currentLogs.length = 0;
        const handleKeyDown = (e: KeyboardEvent) => keyboardState[e.key.toLowerCase()] = true; const handleKeyUp = (e: KeyboardEvent) => keyboardState[e.key.toLowerCase()] = false; document.addEventListener('keydown', handleKeyDown); document.addEventListener('keyup', handleKeyUp);
        const gameLoop = () => {
            if (isPaused) { gameLoopId = requestAnimationFrame(gameLoop); return; }
            const now = performance.now(); let dt = (now - lastFrameTime) / 1000; lastFrameTime = now; if (dt > 1 / 30) dt = 1 / 30;
            const timerCtx = { ...baseContext, deltaTime: 0, nodeOutputCache: new Map(), nodes: previewingScene.nodes, connections: previewingScene.connections }; const timersToRemove: string[] = [], timersToReset: { id: string, timer: TimerState }[] = [];
            for (const [id, timer] of activeTimers.entries()) { if (now >= timer.startTime + timer.duration * 1000) { const node = previewingScene.nodes.find(n => n.id === id); if (node) triggerOutput(node.id, 'onFinished', timerCtx); if (timer.loop) timersToReset.push({ id, timer: { ...timer, startTime: now } }); else timersToRemove.push(id); } }
            timersToRemove.forEach(id => activeTimers.delete(id)); timersToReset.forEach(({ id, timer }) => activeTimers.set(id, timer));
            
            if (clickedObjectIdRef.current) {
                const clickedId = clickedObjectIdRef.current;
                clickedObjectIdRef.current = null; // Consume the click
                const clickCtx = { ...baseContext, gameObjects: simulatedObjects, deltaTime: 0, nodeOutputCache: new Map(), nodes: previewingScene.nodes, connections: previewingScene.connections };
                previewingScene.nodes
                    .filter(n => n.type === 'onClickOrTouch' && (!n.properties.targetObjectId || n.properties.targetObjectId === clickedId))
                    .forEach(node => {
                        triggerOutput(node.id, 'execOut', clickCtx);
                    });
            }

            const finishedCountdowns: string[] = [];
            if (activeCountdowns.size > 0) {
                activeCountdowns.forEach((countdown, nodeId) => {
                    if (countdown.isFinished) return;
                    const remainingMs = Math.max(0, countdown.endTime - now);
                    const formattedTime = formatTime(remainingMs / 1000);
                    simulatedObjects = simulatedObjects.map(go => {
                        if (go.id === countdown.targetId) {
                            const textRenderer = go.behaviors.find(b => b.type === 'textRenderer') as TextRendererBehavior | undefined;
                            if (textRenderer && textRenderer.properties.text !== formattedTime) {
                                const newGo: SimulatedGameObject = JSON.parse(JSON.stringify(go));
                                const newTextRenderer = newGo.behaviors.find(b => b.type === 'textRenderer') as TextRendererBehavior | undefined;
                                if(newTextRenderer) newTextRenderer.properties.text = formattedTime;
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
                const finishCtx = { ...baseContext, gameObjects: simulatedObjects, deltaTime: 0, nodeOutputCache: new Map(), nodes: previewingScene.nodes, connections: previewingScene.connections };
                finishedCountdowns.forEach(nodeId => {
                    const node = previewingScene.nodes.find(n => n.id === nodeId);
                    if (node) triggerOutput(node.id, 'onFinished', finishCtx);
                    activeCountdowns.delete(nodeId);
                });
            }

            simulatedObjects = simulatedObjects.map(go => { if (go.animations?.length > 0 && go.currentAnimation) { const clip = go.animations.find(a => a.name === go.currentAnimation); if (clip?.frames.length > 0) { const dur = 1 / (clip.fps || 10); let time = (go.animationTime || 0) + (dt * (go.animationSpeed || 1)); let frame = Math.floor(time / dur); if (clip.loop) frame %= clip.frames.length; else frame = Math.min(frame, clip.frames.length - 1); return { ...go, animationTime: time, currentFrame: frame }; } } return go; });
            
            simulatedObjects = simulatedObjects.map(go => {
                if (go.aiControllerNodeId && (go.isActive ?? true)) {
                    const aiNode = previewingScene.nodes.find(n => n.id === go.aiControllerNodeId);
                    if (aiNode) {
                        const aiContext = { ...baseContext, gameObjects: simulatedObjects, deltaTime: dt, nodes: previewingScene.nodes, connections: previewingScene.connections, nodeOutputCache: new Map() };
                        return updateEnemyAI(go, aiNode, aiContext);
                    }
                }
                return go;
            });

            simulatedObjects = simulatedObjects.map(go => {
                if (!(go.isActive ?? true)) return go;
                if (go.type !== 'platform' || !go.initialPosition) return go.type === 'platform' ? { ...go, velocity: { x: 0, y: 0 } } : go;
                const ctrl = go.behaviors.find(b => b.type === 'platformController')?.properties;
                if (!ctrl || ctrl.moveDirection === 'None' || ctrl.moveSpeed <= 0) return { ...go, velocity: { x: 0, y: 0 } };
                const prevPos = { ...go.position },
                    newGo = { ...go, position: { ...go.position }, patrolTime: (go.patrolTime || 0) + dt },
                    { moveSpeed: s, moveDistance: d, moveDirection: dir } = ctrl,
                    dur = s > 0 ? d / s : 0;
                if (dur > 0) {
                    const offset = Math.sin((newGo.patrolTime / dur) * Math.PI) * (d / 2);
                    if (dir === 'Horizontal') {
                        newGo.position.x = go.initialPosition.x + offset;
                    } else if (dir === 'Vertical') {
                        newGo.position.y = go.initialPosition.y + offset;
                    }
                }
                newGo.velocity = { x: (newGo.position.x - prevPos.x) / dt, y: (newGo.position.y - prevPos.y) / dt };
                return newGo;
            });
            executeGraph('onUpdate', { ...baseContext, gameObjects: simulatedObjects, deltaTime: dt, nodeOutputCache: new Map() });
            const collidableObjects = simulatedObjects.filter(go => go.useCustomHitboxes && (go.isActive ?? true));
            for (let i = 0; i < collidableObjects.length; i++) {
                for (let j = i + 1; j < collidableObjects.length; j++) {
                    const objA = collidableObjects[i], objB = collidableObjects[j], hitboxesA = getActiveHitboxesForSim(objA), hitboxesB = getActiveHitboxesForSim(objB); let collisionFound = false;
                    for (const boxA of hitboxesA) {
                        for (const boxB of hitboxesB) {
                            if (aabbCollision(boxA, boxB)) {
                                const collisionCtx = { ...baseContext, deltaTime: 0, nodeOutputCache: new Map(), nodes: previewingScene.nodes, connections: previewingScene.connections };
                                previewingScene.nodes.filter(n => n.type === 'onCollision').forEach(node => { collisionCtx.nodeOutputCache.set(`${node.id}-objectA`, objA.id); collisionCtx.nodeOutputCache.set(`${node.id}-objectB`, objB.id); triggerOutput(node.id, 'execOut', collisionCtx); });
                                collisionFound = true; break;
                            }
                        } if (collisionFound) break;
                    }
                }
            }
            setLiveSimObjects([...simulatedObjects]); setLiveVideoState(videoState); setLiveCameraState(cameraState); if (currentLogs.length > 0) setGameLogs(prev => [...prev.slice(-100), ...currentLogs]); currentLogs.length = 0; gameLoopId = requestAnimationFrame(gameLoop);
        };
        lastFrameTime = performance.now(); gameLoopId = requestAnimationFrame(gameLoop);
        return () => { cancelAnimationFrame(gameLoopId); document.removeEventListener('keydown', handleKeyDown); document.removeEventListener('keyup', handleKeyUp); };
    }, [previewingScene, assets, scenes, activeScene.activeLayerName, addLog, evaluateInput, triggerOutput]);

    if (appState === 'intro') {
        return <IntroScene onComplete={() => setAppState('resolution')} />;
    }

    if (appState === 'resolution' || !resolution) {
        return <ResolutionModal onConfirm={(res, name, type, startFs) => {
            setResolution(res);
            setProjectName(name);
            setStartFullscreen(startFs);
            if (type !== activeScene.type) {
                setScenes(s => s.map(scene => scene.id === activeSceneId ? { ...scene, type } : scene));
            }
            setAppState('editor');
        }} />;
    }

    const currentSceneType = activeScene?.type || '2d';

    return (
        <div className="bg-gray-800 text-gray-200 flex flex-col h-screen w-screen overflow-hidden font-sans">
            <Header
                activeView={activeView}
                onPreview={handlePreview}
                onViewChange={setActiveView}
                onShowManual={() => setIsShowingManual(true)}
                onNewProject={handleNewProject}
                onProjectSettings={handleProjectSettings}
                onSaveProject={handleSaveProject}
                onLoadProject={handleLoadProjectTrigger}
                onExportProject={() => setIsExportModalOpen(true)}
                is3DScene={currentSceneType === '3d'}
                showHitboxes={showHitboxes}
                onToggleHitboxes={() => setShowHitboxes(!showHitboxes)}
            />
             <input type="file" ref={projectLoadInputRef} onChange={handleLoadProjectFile} accept=".zip" className="hidden" />

            <main className="flex-grow flex p-3 space-x-3 overflow-hidden">
                {/* Left Column */}
                <div className="w-64 flex-shrink-0 flex flex-col space-y-3">
                    <div className="h-1/2">
                        <ObjectsPanel
                            scenes={scenes}
                            activeSceneId={activeSceneId}
                            gameObjects={activeScene.gameObjects}
                            selectedItems={selectedItems}
                            onSelect={handleSelectionChange}
                            onAddGameObject={() => currentSceneType === '2d' ? setIsShowingAddObjectModal(true) : setIsShowingAddObjectModal3D(true)}
                            onNewScene={handleNewScene}
                            onSelectScene={handleSelectScene}
                            onDeleteScene={handleDeleteScene}
                            onRenameScene={handleRenameScene}
                            onReorderScenes={handleReorderScenes}
                        />
                    </div>
                    <div className="h-1/2">
                        <AssetsPanel assets={assets} />
                    </div>
                </div>

                {/* Center Column */}
                <div className="flex-grow flex flex-col space-y-3">
                    <div className="flex-grow">
                        {activeView === 'Game Scene' ? (
                           currentSceneType === '2d' ? (
                                <SceneView
                                    onCreateSprite={handleCreateSprite}
                                    gameObjects={activeScene.gameObjects}
                                    layers={activeScene.layers}
                                    assets={assets}
                                    selectedItems={selectedItems}
                                    onSelectionChange={handleSelectionChange}
                                    onGameObjectUpdate={handleGameObjectUpdate}
                                    resolution={resolution}
                                    showHitboxes={showHitboxes}
                                />
                            ) : (
                                <SceneView3D
                                    gameObjects={activeScene.gameObjects}
                                    layers={activeScene.layers}
                                    activeScene={activeScene}
                                    selectedItems={selectedItems}
                                    onSelectionChange={handleSelectionChange}
                                    onGameObjectUpdate={handleGameObjectUpdate}
                                    onAddGameObject={handleAddGameObject3D}
                                    onDeleteGameObject={(id) => {
                                        setActiveScene(s => ({...s, gameObjects: s.gameObjects.filter(go => go.id !== id)}))
                                    }}
                                />
                            )
                        ) : (
                            <NodeEditorPanel
                                nodes={activeScene.nodes}
                                connections={activeScene.connections}
                                selectedItem={selectedItems}
                                onSelect={handleSelectionChange}
                                onNodesChange={(nodes) => setActiveScene(s => ({...s, nodes}))}
                                onAddConnection={handleAddConnection}
                                onAddNode={handleAddNode}
                            />
                        )}
                    </div>
                    <div className="h-48 flex-shrink-0">
                       <GameLogPanel logs={gameLogs} />
                    </div>
                </div>

                {/* Right Column */}
                <div className="w-80 flex-shrink-0 flex flex-col space-y-3">
                    <div className="h-2/3">
                        <PropertiesPanel
                            selectedItems={selectedItems}
                            scenes={scenes}
                            gameObjects={activeScene.gameObjects}
                            nodes={activeScene.nodes}
                            onGameObjectUpdate={handleGameObjectUpdate}
                            onNodeUpdate={handleNodeUpdate}
                            onRenameScene={handleRenameScene}
                            onEditAnimations={setEditingAnimationsFor}
                            parsedScripts={parsedScripts}
                            assets={assets}
                            onAssetCreateForGameObject={handleAssetCreateForGameObject}
                            onAssetCreateForNode={handleAssetCreateForNode}
                            onTextureAssigned={onTextureAssigned}
                        />
                    </div>
                    <div className="h-1/3">
                        <LayersPanel
                            layers={activeScene.layers}
                            activeLayerName={activeScene.activeLayerName}
                            onLayersChange={(layers) => setActiveScene(s => ({...s, layers}))}
                            onSetActiveLayer={(name) => setActiveScene(s => ({...s, activeLayerName: name}))}
                            onDeleteLayer={handleDeleteLayer}
                        />
                    </div>
                </div>
            </main>

            {isShowingAddObjectModal && <AddObjectModal onClose={() => setIsShowingAddObjectModal(false)} onSelectObjectType={handleAddGameObject} />}
            {isShowingAddObjectModal3D && <AddObjectModal3D onClose={() => setIsShowingAddObjectModal3D(false)} onSelectEntityType={handleAddGameObject3D} />}
            {editingAnimationsFor && <AnimationPanel gameObject={editingAnimationsFor} onClose={() => setEditingAnimationsFor(null)} onSave={handleSaveAnimations} assets={assets} onUpdateAsset={handleUpdateAsset} />}
            {previewingScene && <GamePreviewWindow scene={previewingScene} assets={assets} onClose={stopPreview} resolution={resolution} simulatedObjects={liveSimObjects} cameraState={liveCameraState} isFullscreen={isPreviewFullscreen} showHitboxes={showHitboxes} onObjectClicked={(id) => { clickedObjectIdRef.current = id; }} />}
            <AIAssistant />
            {isProjectSettingsOpen && <ResolutionModal isEditing onClose={() => setIsProjectSettingsOpen(false)} initialName={projectName} initialResolution={resolution} initialStartFullscreen={startFullscreen} onConfirm={(res, name, type, startFs) => { setResolution(res); setProjectName(name); setStartFullscreen(startFs); setIsProjectSettingsOpen(false); }} />}
            {isShowingManual && <ManualModal onClose={() => setIsShowingManual(false)} />}
            {isExportModalOpen && <ExportModal onClose={() => setIsExportModalOpen(false)} onExport={handleExportProject} />}
        </div>
    );
};

export default App;
