// services/nodeLogic/keyboardPlatformerController.ts
import { NodeLogicHandler } from './types';
import { SimulatedGameObject } from '../../types';

// --- Physics Helper Types ---
interface BoundingBox { x: number; y: number; width: number; height: number; }
interface CollisionResult { time: number; normal: { x: number; y: number }; }

// --- Physics Helper Functions ---

const getActiveHitboxes = (go: SimulatedGameObject): BoundingBox[] => {
    const transform = go.behaviors.find(b => b.type === 'transform')?.properties;
    if (!transform) return [];

    const getBoundingBox = () => {
        const scale = transform.scale || { x: 1, y: 1 };
        const width = 32 * Math.abs(scale.x);
        const height = 32 * Math.abs(scale.y);
        return { x: go.position.x - width / 2, y: go.position.y - height / 2, width, height };
    };

    if (!go.useCustomHitboxes || !go.animations) {
        return [getBoundingBox()];
    }

    const activeClip = go.animations?.find(anim => anim.name === go.currentAnimation);
    if (!activeClip || activeClip.frames.length === 0) {
        return [getBoundingBox()];
    }
    
    const frameIndex = activeClip.syncHitboxes ? 0 : (go.currentFrame || 0);
    const currentFrame = activeClip.frames[frameIndex];
    if (!currentFrame || !currentFrame.hitboxes || currentFrame.hitboxes.length === 0) {
        return [getBoundingBox()];
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

const sweptAABB = (box1: BoundingBox, vel: {x: number, y: number}, box2: BoundingBox): CollisionResult => {
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

export const logic: Record<string, NodeLogicHandler> = {
    keyboardPlatformerController: (node, context) => {
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
            key: (props[`attack${index}Key`] || '')?.toLowerCase(),
            anim: props[`attack${index}Anim`]
        })).filter(a => a.key && a.anim);
        const attackAnims = new Set(attacks.map(a => a.anim));

        const collidables = context.gameObjects.filter(go => go.type === 'platform' || go.type === 'hitbox');

        context.setGameObjects(gos => gos.map(go => {
            if (go.id !== targetId || !(go.isActive ?? true)) return go;
            
            const newGo: SimulatedGameObject = JSON.parse(JSON.stringify(go));
            newGo.prevPosition = go.position;

            const keysDownPreviously = go._attackState?.keysDownPreviously ?? new Set<string>();
            const leftDown = !!context.keyboardState[leftKey];
            const rightDown = !!context.keyboardState[rightKey];
            const jumpDown = !!context.keyboardState[jumpKey];
            const wasJumpDown = keysDownPreviously.has(jumpKey);
            const jumpJustPressed = jumpDown && !wasJumpDown;
            const moveInput = (rightDown ? 1 : 0) - (leftDown ? 1 : 0);
            
            // --- Determine Attack State ---
            let isAttacking = false;
            let attackAnimToPlay: string | null = null;
            let newAttackTriggered = false;

            // Check for a new attack input
            for (const attack of attacks) {
                if (!!context.keyboardState[attack.key] && !keysDownPreviously.has(attack.key)) {
                    isAttacking = true;
                    newAttackTriggered = true;
                    attackAnimToPlay = attack.anim;
                    break;
                }
            }

            // Check if an existing attack animation is still playing
            if (!isAttacking) {
                const currentIsAttack = attackAnims.has(newGo.currentAnimation ?? '');
                if (currentIsAttack) {
                    const currentClip = newGo.animations?.find(a => a.name === newGo.currentAnimation);
                    const duration = currentClip ? currentClip.frames.length / (currentClip.fps || 10) : 0;
                    if ((newGo.animationTime ?? 0) < duration) {
                        isAttacking = true;
                        attackAnimToPlay = newGo.currentAnimation; // Continue this animation
                    }
                }
            }
            
            // --- Set Velocities from Input ---
            newGo.velocity.y += props.gravity * context.deltaTime;
            
            if (isAttacking && newGo.isGrounded) {
                 newGo.velocity.x = 0;
            } else {
                 newGo.velocity.x = moveInput * Math.abs(props.speed);
            }
            
            if (jumpJustPressed && newGo.isGrounded) {
                newGo.velocity.y = -props.jumpStrength;
            }
            
            // --- Physics and Collision Resolution ---
            if (moveInput !== 0) {
                const transform = newGo.behaviors.find(b => b.type === 'transform');
                if (transform) transform.properties.scale.x = Math.abs(transform.properties.scale.x) * moveInput;
            }
            
            const hDisplacement = { x: newGo.velocity.x * context.deltaTime, y: 0 };
            let nearestHCollision: CollisionResult = { time: 1, normal: {x: 0, y: 0} };
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
            let nearestVCollision: CollisionResult = { time: 1, normal: {x: 0, y: 0} };
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
            
            // --- Animation State Machine (Priority-based) ---
            let finalAnimation = newGo.currentAnimation;

            if (isAttacking && attackAnimToPlay) {
                finalAnimation = attackAnimToPlay;
            } else if (!newGo.isGrounded) {
                finalAnimation = newGo.velocity.y > 0 ? props.fallAnim : props.jumpAnim;
            } else if (moveInput !== 0) {
                finalAnimation = props.runAnim;
            } else {
                finalAnimation = props.idleAnim;
            }

            if (finalAnimation && newGo.currentAnimation !== finalAnimation) {
                if (newGo.animations?.some(a => a.name === finalAnimation)) {
                    newGo.currentAnimation = finalAnimation;
                    newGo.animationTime = 0;
                    newGo.currentFrame = 0;
                }
            } else if (newAttackTriggered && finalAnimation === newGo.currentAnimation) {
                // This handles re-triggering the same attack to restart it
                newGo.animationTime = 0;
                newGo.currentFrame = 0;
            }
            
            // Update key state for next frame's "just pressed" checks
            const currentKeysDown = new Set<string>();
            attacks.forEach(attack => { if (!!context.keyboardState[attack.key]) currentKeysDown.add(attack.key); });
            if (jumpDown) currentKeysDown.add(jumpKey);
            newGo._attackState = { keysDownPreviously: currentKeysDown };
            
            return newGo;
        }));
        context.triggerOutput(node.id, 'execOut', context);
    },
};
