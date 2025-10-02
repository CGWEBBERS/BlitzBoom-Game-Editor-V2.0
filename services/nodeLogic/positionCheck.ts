// services/nodeLogic/positionCheck.ts
import { NodeLogicHandler } from './types';

export const logic: Record<string, NodeLogicHandler> = {
    positionCheck: (node, context) => {
        const targetIdOverride = context.evaluateInput(node.id, 'target', context);
        const targetId = targetIdOverride || node.properties.targetObjectId;

        if (!targetId) {
            context.addLog(`[Warning] Position Check node: No target object specified.`);
            context.triggerOutput(node.id, 'isFalse', context);
            return;
        }

        const targetObject = context.gameObjects.find(go => go.id === targetId);

        if (!targetObject) {
            context.addLog(`[Warning] Position Check node: Target object with ID ${targetId} not found.`);
            context.triggerOutput(node.id, 'isFalse', context);
            return;
        }

        const { coordinate = 'X', operator = '>', value = 0 } = node.properties;
        const position = targetObject.position;
        const valueToCompare = coordinate === 'X' ? position.x : position.y;

        let result = false;
        switch (operator) {
            case '>':
                result = valueToCompare > value;
                break;
            case '<':
                result = valueToCompare < value;
                break;
            case '==':
                result = valueToCompare == value; // Use == for flexible comparison
                break;
        }

        if (result) {
            context.triggerOutput(node.id, 'isTrue', context);
        } else {
            context.triggerOutput(node.id, 'isFalse', context);
        }
    },
};
