// packages/engine-policy/src/policy.ts
import { randomUUID } from 'node:crypto';   // 使用 node: 前缀
import { PolicyEvent, ActionPlan, Action } from './types.js';
import { rules } from './rules.js';

export class PolicyEngine {
  evaluate(event: PolicyEvent): ActionPlan {
    // 收集匹配的规则
    const matchedActions: Action[] = [];
    for (const rule of rules) {
      if (rule.condition(event)) {
        matchedActions.push(...rule.actions(event));
      }
    }
    matchedActions.sort((a, b) => a.priority - b.priority);
    const uniqueActions = this.deduplicateActions(matchedActions);
    return {
      id: randomUUID(),
      event,
      actions: uniqueActions,
      status: 'pending',
    };
  }

  private deduplicateActions(actions: Action[]): Action[] {
    const map = new Map<string, Action>();
    for (const action of actions) {
      const key = action.type + (action.type === 'DEGRADE_SERVICE' ? `-${action.target}` : '');
      if (!map.has(key) || map.get(key)!.priority > action.priority) {
        map.set(key, action);
      }
    }
    return Array.from(map.values());
  }
}