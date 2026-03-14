import { HTMLElement, parse } from 'node-html-parser';

/**
 * A lightweight Cheerio-compatible wrapper around node-html-parser
 * to avoid the heavy 'undici' dependency.
 */

class CheerioWrapper {
    private elements: HTMLElement[];

    constructor(elements: HTMLElement | HTMLElement[]) {
        this.elements = Array.isArray(elements) ? elements : [elements];
    }

    attr(name: string): string | undefined {
        return this.elements[0]?.getAttribute(name);
    }

    text(): string {
        return this.elements.map(el => el.text).join('');
    }

    html(): string {
        return this.elements[0]?.innerHTML || '';
    }

    find(selector: string): CheerioWrapper {
        const found: HTMLElement[] = [];
        this.elements.forEach(el => {
            found.push(...el.querySelectorAll(selector));
        });
        return new CheerioWrapper(found);
    }

    filter(predicate: (index: number, el: HTMLElement) => boolean): CheerioWrapper {
        return new CheerioWrapper(this.elements.filter((el, i) => predicate(i, el)));
    }

    map<T>(fn: (index: number, el: HTMLElement) => T): { get: () => T[] } {
        const results = this.elements.map((el, i) => fn(i, el));
        return {
            get: () => results
        };
    }

    each(fn: (index: number, el: HTMLElement) => void): this {
        this.elements.forEach((el, i) => fn(i, el));
        return this;
    }

    data(name: string): any {
        return this.elements[0]?.getAttribute(`data-${name}`);
    }

    get(index?: number): any {
        if (index === undefined) return this.elements;
        return this.elements[index];
    }

    get length(): number {
        return this.elements.length;
    }
}

export function load(html: string) {
    const root = parse(html);

    const $ = (selector: string | HTMLElement | any) => {
        if (!selector) return new CheerioWrapper([]);
        if (typeof selector === 'string') {
            return new CheerioWrapper(root.querySelectorAll(selector));
        }
        return new CheerioWrapper(selector);
    };

    return $;
}

export default { load };
