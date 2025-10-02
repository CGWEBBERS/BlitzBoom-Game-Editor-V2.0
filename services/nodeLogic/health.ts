
// services/nodeLogic/health.ts
import { NodeLogicHandler } from './types';
import { SimulatedGameObject } from '../../types';

export const logic: Record<string, NodeLogicHandler> = {
    health: (node, context) => {
        const targetId = context.evaluateInput(node.id, 'target', context);
        const amount = context.evaluateInput(node.id, 'amount', context) ?? 10;
        const { 
            action = 'Subtract',
            healthPropertyName = 'health',
            deathAnimationName = 'Death',
            hitAnimationName = 'Hit',
            healAnimationName = 'Heal',
        } = node.properties;

        if (targetId) {
            let died = false;
            context.setGameObjects(gos => gos.map(go => {
                if (go.id === targetId) {
                    const scriptIndex = go.behaviors.findIndex(b => b.type === 'script');
                    const scriptBehavior = scriptIndex !== -1 ? go.behaviors[scriptIndex] : null;

                    if (!scriptBehavior || typeof scriptBehavior.properties[healthPropertyName] !== 'number') {
                        context.addLog(`[Warning] Modify Health: Target '${go.name}' has no script with a '${healthPropertyName}' number property.`);
                        return go;
                    }

                    const currentHealth = scriptBehavior.properties[healthPropertyName];
                    let newHealth;
                    let animationToPlay = null;

                    if (action === 'Subtract') {
                        newHealth = currentHealth - amount;
                        animationToPlay = hitAnimationName;
                    } else { // 'Add'
                        newHealth = currentHealth + amount;
                        animationToPlay = healAnimationName;
                    }

                    if (newHealth <= 0 && action === 'Subtract') {
                        died = true;
                        if (deathAnimationName) {
                            animationToPlay = deathAnimationName;
                        }
                    }
                    
                    const newBehaviors = [...go.behaviors];
                    newBehaviors[scriptIndex] = {
                        ...scriptBehavior,
                        properties: {
                            ...scriptBehavior.properties,
                            [healthPropertyName]: newHealth
                        }
                    };
                    
                    const newGo = { ...go, behaviors: newBehaviors };

                    if (animationToPlay) {
                        newGo.currentAnimation = animationToPlay;
                        newGo.animationTime = 0;
                        newGo.currentFrame = 0;
                    }
                    
                    return newGo;
                }
                return go;
            }));
            
            if (died) {
                context.triggerOutput(node.id, 'onDeath', context);
            }
        }
        
        context.triggerOutput(node.id, 'execOut', context);
    },
};