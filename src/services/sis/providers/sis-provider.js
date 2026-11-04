export class SISProvider {
  async connect() {
    throw new Error('SIS provider connect() is not implemented');
  }

  async testConnection() {
    throw new Error('SIS provider testConnection() is not implemented');
  }

  async getStudents() {
    throw new Error('SIS provider getStudents() is not implemented');
  }

  async disconnect() {
    throw new Error('SIS provider disconnect() is not implemented');
  }
}
