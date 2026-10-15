package com.creditflow.qe;

import org.junit.platform.suite.api.*;

@Suite
@IncludeEngines("cucumber")
@SelectPackages("features")
@ConfigurationParameter(key = "cucumber.glue", value = "com.creditflow.qe")
@ConfigurationParameter(
    key = "cucumber.plugin",
    value =
        "pretty,html:target/cucumber/report.html,json:target/cucumber/report.json,junit:target/cucumber/report.xml")
public class RunCucumberTest {}
