pipeline {
  agent { label 'linux-docker-java21' }
  options { timestamps(); timeout(time: 25, unit: 'MINUTES'); disableConcurrentBuilds() }
  environment { COMPOSE_PROJECT_NAME = "creditflow-qe-${BUILD_NUMBER}" }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Build and start isolated application') {
      steps {
        sh '''
          set -eu
          umask 077
          printf 'CREDITFLOW_DB_PASSWORD=%s\n' "$(openssl rand -hex 32)" > .env
          docker volume create creditflow-qe-maven-cache
          docker compose --env-file .env -f infrastructure/compose.yml up -d --build --wait postgres api
        '''
      }
    }
    stage('Unit and PostgreSQL/API automation') {
      steps { sh 'docker compose --env-file .env -f infrastructure/compose.yml run --rm verify' }
    }
    stage('Execution evidence and dependency quality') {
      steps {
        sh '''
          set -eu
          python3 infrastructure/verify-evidence.py
          sh ./mvnw -B org.cyclonedx:cyclonedx-maven-plugin:2.9.1:makeAggregateBom -DincludeTestScope=true -DoutputFormat=json
          python3 infrastructure/audit-dependencies.py
        '''
      }
    }
  }
  post {
    always {
      junit testResults: '**/target/surefire-reports/TEST-*.xml,**/target/failsafe-reports/TEST-*.xml', allowEmptyResults: false
      archiveArtifacts artifacts: '**/target/cucumber/*,**/target/site/jacoco/**,.work/*summary.json,.work/dependency-audit.json', allowEmptyArchive: true
      sh 'docker compose --env-file .env -f infrastructure/compose.yml down || true'
    }
    failure { echo 'Verification failed; inspect the test reports and stage logs. No release was attempted.' }
  }
}
