import * as fs from 'fs';
import {
  slow,
  suite,
  test,
  timeout,
} from 'mocha-typescript';
import * as parse5 from 'parse5';
import * as path from 'path';

import {
  CascadeTestError,
  CascadeTestResult,
  debugError,
  testOptimizationCascade,
} from './util/assertCascade';
import {
  walkElements,
} from './util/SimpleTemplateRunner';
import {
  TestTemplate,
} from './util/TestTemplate';

function testDefaults(...stylesAndTemplates: Array<string | TestTemplate>): Promise<CascadeTestResult> {
  return testOptimizationCascade(
    { },
    { rewriteIdents: {id: true, class: true} },
    ...stylesAndTemplates).catch((e: CascadeTestError) => {
      debugError(stylesAndTemplates.filter(s => typeof s === "string").join("\n"), e);
      throw e;
    });
}

@suite("Integration Tests", slow(3000), timeout(4000))
export class IntegrationTests {
  @test "Google Homepage"() {
    let css = fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/integration-tests/google-homepage/styles.css"), "utf-8");
    let markup = fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/integration-tests/google-homepage/markup.html"), "utf-8");
    let template = new TestTemplate("test", markup, true);
    return testDefaults(css, template).then(_result => {
      // logOptimizations(result.optimization);
      // return debugSize(css, result).then(() => {
      //   // debugResult(css, result);
      // });
    });
  }
  @test "NYT Homepage"() {
    let markup = fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/integration-tests/nytimes-homepage/markup.html"), "utf-8");
    let css = fs.readFileSync(path.resolve(__dirname, "../../test/fixtures/integration-tests/nytimes-homepage/styles.css"), "utf-8");
    let template = new TestTemplate("test", markup, true);
    return testDefaults(css, template).then(_result => {
      // logOptimizations(result.optimization);
      // return debugSize(css, result).then(() => {
      //   debugResult(css, result);
      // });
    });
  }
}

export function extractInlineStyleTags(html: string) {
  let document = parse5.parse(html, {
    treeAdapter: parse5.treeAdapters.default
  }) as parse5.AST.Default.Document;
  let css = "";
  walkElements(document, (element) => {
    if (element.tagName === "style") {
      element.childNodes.forEach(e => {
        css += (<parse5.AST.Default.TextNode>e).value;
      });
    }
  });
}