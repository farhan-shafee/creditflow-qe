pipeline {
  agent { label 'linux-docker-java21' }
  options { timestamps(); timeout(time: 35, unit: 'MINUTES'); disableConcurrentBuilds() }
  environment { COMPOSE_PROJECT_NAME = "creditflow-qe-${BUILD_NUMBER}" }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Evidence gate behavior') {
      steps { sh 'python3 -m unittest infrastructure/test_evidence_run.py -v' }
    }
    stage('Unit and PostgreSQL/API automation') {
      steps { sh 'node infrastructure/verify.cjs' }
    }
    stage('Independent public-mode automation') {
      steps { sh 'node infrastructure/public-verify.cjs' }
    }
    stage('Execution evidence and dependency quality') {
      steps {
        sh '''
          set -eu
          node infrastructure/quality-verify.cjs
          python3 infrastructure/verify-evidence.py --scope core --scope public --scope quality
        '''
      }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: '.work/evidence/runs/**,.work/evidence/latest/**', allowEmptyArchive: true
      junit testResults: '.work/evidence/current/core/snapshot/services/banking-api/target/surefire-reports/TEST-*.xml,.work/evidence/current/core/snapshot/services/banking-api/target/failsafe-reports/TEST-*.xml,.work/evidence/current/core/snapshot/automation/api-bdd/target/cucumber/report.xml,.work/evidence/current/core/snapshot/automation/api-testng/target/surefire-reports/TEST-*.xml,.work/evidence/current/public/snapshot/automation/api-bdd/target/cucumber/report.xml,.work/evidence/current/public/snapshot/automation/api-testng/target/surefire-reports/TEST-*.xml', allowEmptyResults: false
    }
    failure { echo 'Verification failed; inspect the frozen scope reports and command logs. No release was attempted.' }
    cleanup { sh 'python3 infrastructure/evidence-run.py cleanup || true' }
  }
}
