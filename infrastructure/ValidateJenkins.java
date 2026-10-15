import java.io.File;

/** Parse Groovy without executing pipeline steps. Jenkins plugin/runtime validation is separate. */
class ValidateJenkins {
  public static void main(String[] args) throws Exception {
    Class<?> type=Class.forName("org.codehaus.groovy.control.CompilationUnit");
    Object unit=type.getConstructor().newInstance();
    type.getMethod("addSource",File.class).invoke(unit,new File("Jenkinsfile"));
    type.getMethod("compile",int.class).invoke(unit,3); // Groovy CONVERSION: syntax and AST only.
    System.out.println("Jenkinsfile Groovy syntax parsed; Jenkins server execution remains unverified.");
  }
}
