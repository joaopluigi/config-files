import { readFile } from 'node:fs/promises';
import { WorklogStore } from '../storage/store.mjs';
import { mainPath, readRegistry } from '../storage/repository.mjs';
import { validateId } from '../domain/worklog.mjs';

function parseEntries(content) {
  return content
    .split('\n')
    .filter((line) => /^\S+ #\d+ \S+ \S+ /.test(line))
    .map((line) => {
      const [, time, item, actor, tag, message] = line.match(/^(\S+) #(\d+) (\S+) (\S+) (.*)$/);
      return { time, item: Number(item), actor, tag, message };
    });
}

function parseWorkingDirectory(content) {
  return content.match(/^working directory: (.+)$/m)?.[1]?.trim();
}

export class WorklogService {
  constructor(options) {
    this.storage = options?.storage ?? (options?.listWorklogs ? options : new WorklogStore());
  }

  listWorklogs(actor = 'orchestrator') {
    return this.storage.listWorklogs(actor);
  }

  listViewerWorklogs() {
    return this.storage.listViewerWorklogs();
  }

  async readViewerWorklog(orchestrationId) {
    return this.readWorklog(orchestrationId);
  }

  async readWorklog(orchestrationId) {
    validateId(orchestrationId, 'orchestration id');
    if (this.storage.readWorklog) return this.storage.readWorklog(orchestrationId);
    const registry = await readRegistry(orchestrationId);
    const content = await readFile(mainPath(orchestrationId), 'utf8');
    return {
      orchestrationId,
      workingDirectory: parseWorkingDirectory(content),
      actor: registry.actor,
      goal: registry.goal,
      done: registry.done,
      steps: registry.steps,
      entries: parseEntries(content),
    };
  }
}
