import * as repository from './repository.mjs';

export class WorklogStore {
  constructor(backend = repository) {
    this.backend = backend;
  }

  listWorklogs(actor = 'orchestrator') {
    return this.backend.discoverSessions(actor);
  }

  listViewerWorklogs() {
    return this.backend.discoverViewerSessions();
  }

  readWorklog(orchestrationId) {
    return this.backend.readViewerWorklog(orchestrationId);
  }
}
