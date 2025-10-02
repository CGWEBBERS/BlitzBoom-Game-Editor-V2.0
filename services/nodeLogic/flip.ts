// services/nodeLogic/flip.ts
import { NodeLogicHandler } from './types';
import { SimulatedGameObject } from '../../types';

export const logic: Record<string, NodeLogicHandler> = {
    flipObject: (node, context) => {
        const targetIdFromPin = context.evaluateInput(node.id, 'target', context);
        const targetId = targetIdFromPin || node.properties.targetObjectId;
        
        const flipDirection = node.properties.flipDirection || 'Horizontal';

        if (targetId) {
            context.setGameObjects(gos => gos.map(go => {
                if (go.id === targetId) {
                    const transformIndex = go.behaviors.findIndex(b => b.type === 'transform');
                    if (transformIndex === -1) {
                        context.addLog(`[Warning] Flip Object: Target '${go.name}' has no Transform behavior.`);
                        return go;
                    }

                    const newBehaviors = [...go.behaviors];
                    const oldTransform = newBehaviors[transformIndex];
                    const newScale = { ...oldTransform.properties.scale };

                    if (flipDirection === 'Horizontal') {
                        newScale.x *= -1;
                    } else if (flipDirection === 'Vertical') {
                        newScale.y *= -1;
                    }

                    newBehaviors[transformIndex] = {
                        ...oldTransform,
                        properties: {
                            ...oldTransform.properties,
                            scale: newScale,
                        }
                    };
                    
                    return { ...go, behaviors: newBehaviors };
                }
                return go;
            }));
        } else {
            context.addLog(`[Warning] Flip Object node was triggered but no target was provided.`);
        }

        context.triggerOutput(node.id, 'execOut', context);
    },
    isFlipped: (node, context) => {
        // This is a pure data node. It calculates a value and caches it.
        const targetId = context.evaluateInput(node.id, 'target', context) || node.properties.targetObjectId;
        const axis = node.properties.axis || 'X';
        const checkIfFlipped = node.properties.checkIfFlipped === true; // The desired state we are checking for

        let finalResult = false; // Default result if something goes wrong

        if (targetId) {
            const targetObject = context.gameObjects.find(go => go.id === targetId);
            if (targetObject) {
                const transform = targetObject.behaviors.find(b => b.type === 'transform');
                if (transform) {
                    const scale = transform.properties.scale || { x: 1, y: 1 };
                    let isActuallyFlipped = false;

                    if (axis === 'X') {
                        isActuallyFlipped = scale.x < 0;
                    } else if (axis === 'Y') {
                        isActuallyFlipped = scale.y < 0;
                    }
                    
                    // The output is true if the actual state matches the state we're checking for
                    finalResult = (isActuallyFlipped === checkIfFlipped);
                }
            }
        }
        
        // Cache the final boolean result. The output pin ID in the blueprint is 'isFlipped'.
        context.nodeOutputCache.set(`${node.id}-isFlipped`, finalResult);
    },
};