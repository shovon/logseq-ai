import { createJobActor, type JobActor, type JobRunner } from "./job-actor";

type JobActorMeta<TInput, TResult> = {
  actor: JobActor<TInput, TResult>;
  references: Set<object>;
  unsubscribe: () => void;
};

export function createJobPool<TKey, TInput, TResult>(
  init: (key: TKey) => JobRunner<TInput, TResult>
) {
  const actorPool = new Map<TKey, JobActorMeta<TInput, TResult>>();
  const referenceToKey = new WeakMap<object, [TKey]>();

  const deleteActor = (key: TKey) => {
    const actorMeta = actorPool.get(key);
    if (!actorMeta) return;
    actorMeta.unsubscribe();
    actorPool.delete(key);
  };

  const newActorMeta = (key: TKey) => {
    const actor = createJobActor(init(key));
    const unsubscribe = actor.subscribe(() => {
      clearUnused(key);
    });
    const actorMeta = { actor, references: new Set<object>(), unsubscribe };
    actorPool.set(key, actorMeta);
    return actorMeta;
  };

  const replaceActorMeta = (key: TKey) => {
    deleteActor(key);
    return newActorMeta(key);
  };

  const clearUnused = (key: TKey) => {
    const actorMeta = actorPool.get(key);
    if (!actorMeta) return;
    switch (actorMeta.actor.getSnapshot().type) {
      case "DONE":
      case "IDLE":
      case "CANCELED":
      case "FAILED":
        if (actorMeta.references.size <= 0) {
          deleteActor(key);
        }
        break;
      case "STOPPED":
        deleteActor(key);
        break;
    }
  };

  return {
    acquire: (key: TKey): [JobActor<TInput, TResult>, object] => {
      let actorMeta: JobActorMeta<TInput, TResult>;
      if (!actorPool.has(key)) {
        actorMeta = newActorMeta(key);
      }
      actorMeta = actorPool.get(key)!;
      if (actorMeta.actor.getSnapshot().type === "STOPPED") {
        actorMeta = replaceActorMeta(key);
      }
      const reference = {};

      actorMeta.references.add(reference);

      referenceToKey.set(reference, [key]);

      return [actorMeta.actor, reference];
    },

    free: (reference: object) => {
      const keyTuple = referenceToKey.get(reference);
      referenceToKey.delete(reference);
      if (!keyTuple || keyTuple.length <= 0) return;
      const [key] = keyTuple;
      const actorMeta = actorPool.get(key);
      if (!actorMeta) return;
      actorMeta.references.delete(reference);
      clearUnused(key);
    },
  };
}
