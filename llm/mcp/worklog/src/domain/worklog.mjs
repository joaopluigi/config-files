export const actors = new Set([
  'orchestrator',
  'investigator',
  'ideator',
  'executor',
  'tester',
  'reviewer',
  'critic',
  'maintainer',
  'researcher',
]);
export const availableActors = () => [...actors].join(', ');
export const tags = new Set([
  'think',
  'find',
  'decide',
  'done',
  'plan',
  'question',
  'answer',
  'note',
]);
export const availableTags = () => [...tags].join(', ');

export function validateActor(actor) {
  if (!actors.has(actor))
    throw new Error(`invalid actor "${actor}"; available actors: ${availableActors()}`);
}
export function validateMainActor(actor, message = 'only orchestrator may act as the main actor') {
  validateActor(actor);
  if (actor !== 'orchestrator') throw new Error(message);
}
export function validatePeerActor(actor) {
  validateActor(actor);
  if (actor === 'orchestrator') throw new Error('orchestrator may not act as a peer');
}
export function validateTag(tag) {
  if (!tags.has(tag)) throw new Error(`invalid tag: ${tag}; available tags: ${availableTags()}`);
}
export function validateId(value, name) {
  if (!/^[a-f0-9]{8}$/.test(value)) throw new Error(`invalid ${name}`);
}
export function validateFreeForm(value, name) {
  if (/\r|\n/.test(value)) throw new Error(`${name} must not contain carriage returns or newlines`);
}
export function planItems(content) {
  return [...content.matchAll(/^\s+(\d+)\. /gm)].map(([, item]) => Number(item));
}
export function entryItems(content, tag) {
  return new Set(
    [...content.matchAll(new RegExp(`^\\S+ #(\\d+) \\S+ ${tag} `, 'gm'))].map(([, item]) =>
      Number(item),
    ),
  );
}
export function completion(content, linkedQuestions = {}) {
  const planned = planItems(content);
  const done = entryItems(content, 'done');
  const openItems = planned.filter((item) => !done.has(item));
  const localQuestions = new Set(
    [...content.matchAll(/^\S+ #\d+ \S+ question \[question:([^ ]+)/gm)].map(
      ([, questionId]) => questionId,
    ),
  );
  const localAnswers = new Set(
    [...content.matchAll(/^\S+ #\d+ \S+ answer \[answer:([^ ]+)/gm)].map(
      ([, questionId]) => questionId,
    ),
  );
  const openQuestions = Object.entries(linkedQuestions)
    .filter(([, question]) => !question.answered)
    .map(([questionId]) => questionId);
  for (const questionId of localQuestions)
    if (!localAnswers.has(questionId) && !openQuestions.includes(questionId))
      openQuestions.push(questionId);
  return {
    complete: openItems.length === 0 && openQuestions.length === 0,
    openItems,
    openQuestions,
  };
}
export function validateAppend(content, item, tag, allowUnreasonedDone = false) {
  const planned = planItems(content);
  const done = entryItems(content, 'done');
  if (tag === 'plan')
    throw new Error('plan entries are only allowed during session or subagent creation');
  if (!planned.includes(item)) throw new Error(`unknown plan item: ${item}`);
  if (done.has(item)) throw new Error(`plan item already closed: ${item}`);
  if (tag === 'done') {
    const earlierOpen = planned.some((plannedItem) => plannedItem < item && !done.has(plannedItem));
    if (earlierOpen) throw new Error(`cannot close plan item out of order: ${item}`);
    const reasoned = new Set([...entryItems(content, 'think'), ...entryItems(content, 'decide')]);
    if (!allowUnreasonedDone && !reasoned.has(item))
      throw new Error(`plan item requires prior reasoning: ${item}`);
  }
}
