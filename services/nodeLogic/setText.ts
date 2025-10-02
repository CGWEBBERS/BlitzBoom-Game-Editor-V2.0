// services/nodeLogic/setText.ts
import { NodeLogicHandler } from './types';
import { SimulatedGameObject, TextRendererBehavior } from '../../types';

export const logic: Record<string, NodeLogicHandler> = {
    setText: (node, context) => {
        const targetId = context.evaluateInput(node.id, 'target', context);
        const text = context.evaluateInput(node.id, 'text', context);

        if (targetId && typeof text === 'string') {
            context.setGameObjects(gos => gos.map(go => {
                if (go.id === targetId) {
                    const rendererIndex = go.behaviors.findIndex(b => b.type === 'textRenderer');
                    if (rendererIndex === -1) {
                        context.addLog(`[Warning] Set Text: Target object '${go.name}' does not have a Text Renderer behavior.`);
                        return go;
                    }
                    const newBehaviors = [...go.behaviors];
                    const oldRenderer = newBehaviors[rendererIndex] as TextRendererBehavior;
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
};
