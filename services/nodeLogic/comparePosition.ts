// services/nodeLogic/comparePosition.ts
import { NodeLogicHandler } from './types';

export const logic: Record<string, NodeLogicHandler> = {
    comparePosition: (node, context) => {
        // This is now a pure data node. It calculates a value and caches it.
        const objectAId = context.evaluateInput(node.id, 'objectA', context) || node.properties.objectAId;
        const objectBId = context.evaluateInput(node.id, 'objectB', context) || node.properties.objectBId;

        if (!objectAId || !objectBId) {
            context.nodeOutputCache.set(`${node.id}-isRightOf`, false);
            return;
        }

        const objectA = context.gameObjects.find(go => go.id === objectAId);
        const objectB = context.gameObjects.find(go => go.id === objectBId);

        if (!objectA || !objectB || !objectA.position || !objectB.position) {
            context.nodeOutputCache.set(`${node.id}-isRightOf`, false);
            return;
        }

        const posA = objectA.position;
        const posB = objectB.position;

        const isRightOf = posA.x > posB.x;

        context.nodeOutputCache.set(`${node.id}-isRightOf`, isRightOf);
    },
};