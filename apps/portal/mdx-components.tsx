import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => <h1 className="text-3xl font-bold text-navy mb-4" {...props} />,
    h2: (props) => <h2 className="text-xl font-semibold text-navy mt-8 mb-3" {...props} />,
    p: (props) => <p className="text-slate-700 leading-relaxed mb-4" {...props} />,
    pre: (props) => <pre className="bg-navy text-lime text-sm rounded-lg p-4 overflow-x-auto mb-4" {...props} />,
    code: (props) => <code className="bg-slate-100 rounded px-1.5 py-0.5 text-sm" {...props} />,
    ul: (props) => <ul className="list-disc pl-6 mb-4 text-slate-700" {...props} />,
    a: (props) => <a className="text-navy underline decoration-lime decoration-2" {...props} />,
    ...components,
  };
}
