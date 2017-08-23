import { CssFile, ParsedCssFile } from "./CssFile";
import { StyleMapping } from "./StyleMapping";
import { OptiCSSOptions, DEFAULT_OPTIONS } from "./OpticssOptions";
import { TemplateAnalysis } from "./TemplateAnalysis";
import { TemplateTypes } from "./TemplateInfo";
import { optimizations, Optimization, SingleFileOptimization, MultiFileOptimization } from "./optimizations";
import * as postcss from "postcss";
import Concat = require("concat-with-sourcemaps");
import { SelectorCache } from "./query";

export interface OptimizationResult {
  output: CssFile;
  styleMapping: StyleMapping;
}

function optimizesSingleFiles(optimization: Optimization): optimization is SingleFileOptimization {
  if ((<SingleFileOptimization>optimization).optimizeSingleFile) {
    return true;
  } else {
    return false;
  }
}

function optimizesAllFiles(optimization: Optimization): optimization is MultiFileOptimization {
  if ((<MultiFileOptimization>optimization).optimizeAllFiles) {
    return true;
  } else {
    return false;
  }
}

export class Optimizer {
  /**
   * CSS Sources to be optimized.
   */
  sources: Array<CssFile>;

  analyses: Array<TemplateAnalysis<keyof TemplateTypes>>;

  options: OptiCSSOptions;

  private singleFileOptimizations: Array<SingleFileOptimization>;
  private multiFileOptimizations: Array<MultiFileOptimization>;

  /**
   * Creates a new OptiCSS Optimizer.
   *
   * @param {Array<CssFile>} sources a list of css files to be optimized.
   *   within a given css file, the cascade is respected as a conflict resolution
   *   signal. Classes from multiple files are assumed to have an arbitrary ordering
   *   and the cascade is not used to resolve conflicts between properties. Instead,
   *   those conflicts must be resolvable by having analysis information that proves
   *   they don't conflict or by having selectors that unambiguously resolve the conflict.
   */
  constructor(options: Partial<OptiCSSOptions>) {
    this.sources = [];
    this.analyses = [];
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);
    this.singleFileOptimizations = [];
    this.multiFileOptimizations = [];
    if (!this.options.enabled) {
      return;
    }
    Object.keys(optimizations).forEach((opt) => {
      if (this.options[opt]) {
        let Optimization = optimizations[opt];
        let optimization = new Optimization(this.options);
        if (optimizesSingleFiles(optimization)) {
          this.singleFileOptimizations.push(optimization);
        }
        if (optimizesAllFiles(optimization)) {
          this.multiFileOptimizations.push(optimization);
        }
      }
    });
  }

  addSource(file: CssFile) {
    this.sources.push(file);
  }

  addAnalysis(analysis: TemplateAnalysis<keyof TemplateTypes>) {
    this.analyses.push(analysis);
  }

  private optimizeSingleFile(styleMapping: StyleMapping, source: CssFile, cache: SelectorCache): Promise<ParsedCssFile> {
    return parseCss(source).then(file => {
      this.singleFileOptimizations.forEach((optimization) => {
        optimization.optimizeSingleFile(styleMapping, file, this.analyses, cache);
      });
      return file;
    });
  }

  private optimizeAllFiles(styleMapping: StyleMapping, files: Array<ParsedCssFile>, cache: SelectorCache): Promise<Array<ParsedCssFile>> {
    this.multiFileOptimizations.forEach((optimization) => {
      optimization.optimizeAllFiles(styleMapping, files, this.analyses, cache);
    });
    return Promise.resolve(files);
  }

  optimize(outputFilename: string): Promise<OptimizationResult> {
    let styleMapping = new StyleMapping();
    let cache = new SelectorCache();
    let promises = this.sources.map(source => this.optimizeSingleFile(styleMapping, source, cache));

    return Promise.all(promises).then(files => {
      return this.optimizeAllFiles(styleMapping, files, cache);
    }).then((files) => {
      let output = new Concat(true, outputFilename, "\n");
      files.forEach(file => {
        let resultOpts = {
          to: outputFilename,
          map: {
            inline: false,
            prev: file.content.map,
            sourcesContent: true,
            annotation: false
          }
        };
        let result = file.content.root!.toResult(resultOpts);
        output.add(file.filename || "optimized.css", result.css, result.map.toJSON());
      });
      return {
        output: {
          content: output.content.toString(),
          sourceMap: output.sourceMap,
          filename: outputFilename
        },
        styleMapping
      };
    });
  }
}

function parseCss(file: CssFile): Promise<ParsedCssFile> {
  if (typeof file.content === "string") {
    return new Promise<postcss.Result>((resolve, reject) => {
      let sourceMapOptions = {
        inline: false,
        prev: file.sourceMap,
        sourcesContent: true,
        annotation: false
      };
      let processOpts = {
        from: file.filename,
        map: sourceMapOptions
      };
      postcss().process(file.content, processOpts).then(resolve, reject);
    }).then(result => {
      return {
        content: result,
        filename: file.filename,
      };
    });
  } else {
    return Promise.resolve(<ParsedCssFile>file);
  }
}