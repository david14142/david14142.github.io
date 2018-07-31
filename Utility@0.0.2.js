// Olympus
//
// JavaScript functions to facilitate multivariate summaries of data
//
// Copyright (C) 2018 David Schreiber <davidschr@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Utility.js - Text and HTML output, utility summmary functions

(function(global) {

  global.Oj = global.Oj || {} ;
  var Oj = global.Oj;

  // todo: print something for nulls
  Oj.DataFrame.prototype.print = function(rows) {
    if (typeof rows == 'undefined' || rows === 0) rows = this.length;
    console.log(this.columns.join('\t'));
    for(let i of this) {
      console.log(this.getRow(i).join('\t'));
    }
  }

  // produce a cross tabulation from a 2-d summary of data
  Oj.PivotTable.prototype.table = function(options) {
    let defaults = {
      nest_rows: true,
      row_headers: true,
      column_headers: true,
      row_totals: true,
      column_totals: true,
      item_names: false,
      columns: this.summary.columns,
      formats: Object.create(null)
    };

    for (let o in defaults) {
      if (typeof options[o] == 'undefined') options[o] = defaults[o];
    }

    for (let j=0; j < options.columns.length; j++) {
      if (typeof options.formats[options.columns[j]] == 'undefined') {
        options.formats[options.columns[j]] = Oj.format();
      }
    }

    if (typeof options.id == 'undefined') {
      throw 'table: Anchor element not specified.';
    }
    var div = Oj.getElementById(options.id);
    div.e.innerHTML='';
    var table = div.push('table');
    var row;

    // add a header to the table ;
    let head = table.push('thead');
    let hrows = [];
    let hnames = [];
    let leaf_total = 0;

    for (let j=0; j < this.dimensions[1].length; j++) {
      hrows[j] = new Oj.Chain(Oj.create('tr'));
      if (options.row_headers && j == this.dimensions[1].length -1) {
        for (let i=0; i < this.dimensions[0].length; i++) {
          // row headers
          hrows[j].push('th', '', this.dimensions[0][i]);
        }
      } else {
        hrows[j].push('th', {colspan: this.dimensions[0].length});
      }
    }

    // column names - variable column values
    this.breadth(this.margins[1].indices['pivot-order'].root,
      (group, key, value, leaves) => {
        if (value[Symbol.toStringTag] != 'Map') {
          if (options.columns.length > 1) {
            hrows[group.length-1].push('th', {colspan: options.columns.length}, key.toString());
          } else {
            hrows[group.length-1].push('th', '', key.toString());
          }
        } else {
          hrows[group.length-1].push('th', {colspan: leaves * options.columns.length}, key.toString());
        }
        if (group.length == 1) { leaf_total += ( leaves || 1 ) }
      }
    );

    // column headers - variable names
    if (options.column_headers) {
      for (let j=0; j < this.dimensions[1].length ; j++) {
        hnames[j] = new Oj.Chain(Oj.create('tr'));
          hnames[j].push('th', {colspan: this.dimensions[0].length})
          hnames[j].push('th', {colspan: leaf_total }, this.dimensions[1][j]);
          if (options.row_totals && j===0) {
            hnames[j].push('th', {rowspan: this.dimensions[1].length * 2}, 'Total');
          }
      }
    }

    // add item item names
    if (options.item_names) {
      hrows.push(new Oj.Chain(Oj.create('tr')));
      for (let j=0; j < options.columns.length; j++) {
        hrows[hrows.length-1].push('th', {colspan: this.dimensions[0].length})
        hrows[hrows.length-1].push('th', {colspan: leaf_total }, options.columns[j]);
      }
    }

    // link in the header structure
    for (let j=0; j < this.dimensions[1].length; j++) {
      if (options.column_headers) head.link(hnames[j]);
      head.link(hrows[j]);
      if (options.item_names) {
        head.link(hrows[j+1]);
      }
    }

    // add the table body ;
    let body = table.push('tbody');
    let h = [];
    this.traverse(
      (group, key, value, leaves, order) => {
        // row headings
        if (options.nest_rows) {
          if (group.length < this.dimensions[0].length) {
            h.push(Oj.create('th', {rowspan: leaves }, key.toString()))
          }
          if (group.length === this.dimensions[0].length) {
            row = body.push('tr');
            for (let i=0; i < h.length; i++) {
              row.append(h[i]);
            }
            row.push('th', '', key.toString());
            h = [];
          }
        } else {
          if (group.length == this.dimensions[0].length) {
            row = body.push('tr');
            for (let j=0; j < group.length; j++) {
              row.push('th', '', group[j].toString());
            }
          }
        }
        // table interior
        // todo: support multiple columns
        // todo: number formatting options
        if (value === null) {
          row.push('td', '', '');
        } else if (value[Symbol.toStringTag] != 'Map') {
          for (let j=0; j < options.columns.length; j++) {
            let name = options.columns[j];
            row.push('td', '', options.formats[name](this.summary.data[name][value]));
          }
        }
      },
      // table body final function (row totals)
      (group, key, value, leaves, order) => {
        if (options.row_totals && group.length == this.dimensions[0].length) {
          let total = this.margins[0].find(group);
          for (e in total) {
            name = options.columns[e];
            row.push('td', '', options.formats[name](total[name]));
          }
        }
      }
    );

    // column totals
    let t = body.push('tr');
    t.push('th', {colspan: this.dimensions[0].length}, 'Total');
    this.sort(this.margins[1].indices['pivot-order'].root,
      (group, key, value) => {
        //console.log(group);
        if (group.length === this.dimensions[1].length) {
          let i = this.margins[1].indices['pivot-order'].find(group);
          //console.log(total);
          for (e in options.columns) {
            name = options.columns[e];
            t.push('td', '', options.formats[name](this.margins[1].data[name][i] ));
          }
        }
      }
    );

    // grand total
    if (options.row_totals && options.column_totals) {
      for (e in this.total) {
        t.push('td', '', options.formats[e](this.total[e]));
      }
    }
  }

  Oj.sum = function(column) {
    var sum = function(results, row) {
      return (results || 0) + row[column]
    };
    return sum;
  }

  Oj.count = function(column) {
    var count = function(results, row) {
      return (results || 0) + 1
    };
    return count;
  }

  Oj.log = function(string) {
    let n = new Date();
    console.log(n + '> ' + string )
  }

  // https://stackoverflow.com/questions/149055/
  // todo: use Intl.NumberFormat
  Oj.format = function(places, currency) {
    let format = function(number) {
      return (currency || '') + number.toFixed(places || 0).replace(/(\d)(?=(\d{3})+(?:\.\d+)?$)/g, "$1,");
    }
    return format;
  }

  // link an element or list of elements into a method chain
  Oj.Chain = function(element) {
    this.isOj = true;
    // create an empty chain
    if (typeof element === 'undefined') return this;
    let type = Oj.nodeType(element);
    // with node lists or HTML collections return an array-like collection
    if (type === 0) {
      this.l = [];
      for (let i=0 ; i < element.length; i++) {
        this.l[i] = new Oj.Chain(element[i]);
      }
      return this;
    }
    // for elements just return a single link
    if (type === 1) {
      this.e = element;
      return this;
    }
    else return null;
  }

  // todo: re-write this to extend element rather than wrap it
  // push a new element onto a chain; allows method chaining
  Oj.Chain.prototype.push = function(name, attributes, text) {
    // handles arrays by allowing a map-like pushing of identical elements
    if (this.isOj === true && typeof this.l != 'undefined') {
      var n = new Oj.Chain();
      n.l=[];
      if(typeof text === 'string' && text !== '') {
        for(let i=0; i < this.l.length; i++) {
          n.l.push(this.l[i].push(name, attributes, text));
        }
      }
      if(Array.isArray(text)) {
        for(let i=0; i < this.l.length; i++) {
          n.l.push(this.l[i].push(name, attributes, text[i]));
        }
      }
      return n;
    }
    // else just push a single element
    else {
      var e = this.e.appendChild(document.createElement(name));
      if(typeof attributes === 'object') for (a in attributes) e.setAttribute(a, attributes[a]);
      if(typeof text === 'string' && text !== '') e.appendChild(document.createTextNode(text));
      if(typeof text !== 'undefined' && typeof text.nodeType !== 'undefined' && text.nodeType === 1 ) e.appendChild(text);
      return new Oj.Chain(e);
    }
  }

  Oj.Chain.prototype.link = function(chain) {
    this.e.appendChild(chain.e);
    return chain;
  }

  Oj.create = function(name, attributes, text) {
    var e  = document.createElement(name);
    if(typeof attributes === 'object') for (a in attributes) e.setAttribute(a, attributes[a]);
    if(typeof text === 'string' && text !== '') e.appendChild(document.createTextNode(text));
    return e;
  }

  Oj.Chain.prototype.append = function(element) {
    var e = this.e.appendChild(element);
    return new Oj.Chain(e);
  }

  Oj.Chain.prototype.clear = function () {
    this.e.innerHTML = null;
  }

  Oj.getElementsByClassName = function(name) {
    var n = document.getElementsByClassName(name);
    return new Oj.Chain(n);
  }

  Oj.getElementById = function(name) {
    var e  =  document.getElementById(name);
    return new Oj.Chain(e);
  }

  Oj.nodeType = function(node) {
    if (['[object NodeList]','[object HTMLCollection]'].includes(node.toString())) return 0;
    return node.nodeType;
  }

} (this));

var Oj = Oj || this.Oj ;
