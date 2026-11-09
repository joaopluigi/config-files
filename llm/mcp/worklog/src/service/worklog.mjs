import { WorklogStore } from '../storage/store.mjs';

export class WorklogService {
  constructor(options) {
    this.storage = options?.storage ?? (options?.listWorklogs ? options : new WorklogStore());
  }

  listWorklogs(actor = 'orchestrator') {
    return this.storage.listWorklogs(actor);
  }
}
