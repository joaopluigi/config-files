import * as repository from './repository.mjs';

export class WorklogStore {
  constructor(backend = repository) {
    this.backend = backend;
  }

  listWorklogs(actor = 'orchestrator') {
    return this.backend.discoverSessions(actor);
  }
}
