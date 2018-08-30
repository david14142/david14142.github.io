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
    if (arguments.length === 1) {
      console.log(n + '> ' + string );
    } else {
      for (let i=0; i < arguments.length; i++) {
        let a;
        if (typeof arguments[i] == 'undefined') {
          a = '\\u';
        } else if (typeof arguments[i] == 'object'  && !Array.isArray(arguments[i])) {
          a = '\\o';
        } else {
          a = arguments[i].toString();
        }
        var s = (typeof s == 'undefined' ? '' : s + '\t') + a;
      }
      console.log(n + '> ' + s);
    }
  }

  // dummy interface for logging callbacks
  Oj.Echo = class extends Oj.Interface {
    constructor(dimension) {
      super(dimension);
    }
  }
  Oj.Echo.prototype.init = function(...args) { Oj.log.apply(null, ['init: '].concat(args)) };
  Oj.Echo.prototype.begin = function(...args) { Oj.log.apply(null, ['begin: '].concat(args)) };
  Oj.Echo.prototype.interior = function(...args) { Oj.log.apply(null, ['interior: '].concat(args)) };
  Oj.Echo.prototype.end = function(...args) { Oj.log.apply(null, ['end: '].concat(args)) };
  Oj.Echo.prototype.final = function(...args) { Oj.log.apply(null, ['final: '].concat(args)) };

  // interface for the last dimension (columns-interior) of a table
  Oj.TableColumns = class extends Oj.Interface {
    constructor(dimension) {
      super(dimension);
    }
  }

  Oj.PivotTable.prototype.table = function(options) {
    const pivot = this;

    // starting dimension for the 2-d table
    let dim = this.dimensions.length === 2 ? 0 : 1;
    if (dim === 0) {
      var row_depth = pivot.dimensions[0].length;
    } else {
      var row_depth = pivot.dimensions[0].length + pivot.dimensions[1].length;
    }

    let defaults = {
      nest_rows: true,
      row_headers: true,
      column_headers: true,
      row_totals: true,
      column_totals: true,
      item_names: false,
      columns: Object.keys(this.expression),
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

    let anchor = Oj.getElementById(options.id);
    anchor.e.innerHTML='';
    let div;
    // 2d tables get written directly to the anchor;
    if (pivot.dimensions.length === 2) div = anchor;
    let table, head, body, row;
    let hrows = [], hnames = [], h = [];
    let prows = []; // page totals
    let leaf_total = 0;  

    let d1 = new Oj.Interface(dim+1);
    d1.interior = function(crossing, key, value) {
      let a = key === SUBTOTAL ? {class: 'st'} : '';
      if (value === null) {
        row.push('td', a, '');
      } else {
        for (let j=0; j < options.columns.length; j++) {
          let name = options.columns[j];
          row.push('td', a, options.formats[name](value[name]));
        }
      }
    }

    let d0 = new Oj.Interface(dim);
    d0.follow = d1;

    d0.init = function() {
      //table = div.push('table');
      table = new Oj.Chain(Oj.create('table'))
      // add a header to the table ;
      head = table.push('thead');
      // table body ;
      body = table.push('tbody');
      // Table init - sets up the column headings and the box
      // todo: this needs to be decoupled from the pivot table structure
      for (let j=0; j < pivot.dimensions[dim+1].length; j++) {
        hrows[j] = new Oj.Chain(Oj.create('tr'));
        if (options.row_headers && j == pivot.dimensions[dim+1].length -1) {
          for (let i=0; i < pivot.dimensions[dim].length; i++) {
            // row headers
            hrows[j].push('th', '', pivot.dimensions[dim][i]);
          }
        } else {
          hrows[j].push('th', {colspan: pivot.dimensions[dim].length});
        }
      }

      // column names - variable column values
      pivot.breadth(pivot.margins[dim+1].indices['pivot-order'].root,
        (group, key, value, leaves) => {
          var k = key === SUBTOTAL ? 'Total' : key;
          if (value[Symbol.toStringTag] != 'Map') {
            if (options.columns.length > 1) {
              hrows[group.length-1].push('th', {colspan: options.columns.length}, k.toString());
            } else {
              hrows[group.length-1].push('th', '', k.toString());
            }
          } else {
            hrows[group.length-1].push('th', {colspan: leaves * options.columns.length}, k.toString());
          }
          if (group.length == 1) { leaf_total += ( leaves || 1 ) }
        }
      );
      if (options.row_totals) {
        let span = options.column_headers ? pivot.dimensions[dim+1].length * 2 : pivot.dimensions[dim+1].length ;
        hrows[0].push('th', {rowspan: pivot.dimensions[dim+1].length * 2}, 'Total');
      }

      // column headers - variable names
      if (options.column_headers) {
        for (let j=0; j < pivot.dimensions[dim+1].length ; j++) {
          hnames[j] = new Oj.Chain(Oj.create('tr'));
            hnames[j].push('th', {colspan: pivot.dimensions[dim].length})
            hnames[j].push('th', {colspan: leaf_total }, pivot.dimensions[dim+1][j]);
        }
      }

      // add item item names
      if (options.item_names) {
        hrows.push(new Oj.Chain(Oj.create('tr')));
        for (let j=0; j < options.columns.length; j++) {
          hrows[hrows.length-1].push('th', {colspan: pivot.dimensions[dim].length})
          hrows[hrows.length-1].push('th', {colspan: leaf_total }, options.columns[j]);
        }
      }

      // link in the header structure
      for (let j=0; j < pivot.dimensions[dim+1].length; j++) {
        if (options.column_headers) head.link(hnames[j]);
        head.link(hrows[j]);
        if (options.item_names) {
          head.link(hrows[j+1]);
        }
      }
    }

    d0.begin = function(group, leaves) {
      // row headings
      let key = group[group.length-1];
      let k = key === SUBTOTAL ? 'Total' : key;
      let a = key === SUBTOTAL ? {class: 'st'} : '';
      if (options.nest_rows) {
        if (group.length < row_depth) {
          h.push(Oj.create('th', {rowspan: leaves }, k.toString()))
        }
        if (group.length === row_depth) {
          row = body.push('tr', a);
          for (let i=0; i < h.length; i++) {
            row.append(h[i]);
          }
          row.push('th', '', k.toString());
          h = [];
        }
      } else {
        if (group.length === row_depth) {
          row = body.push('tr', a);
          for (let j=0; j < group.length; j++) {
            row.push('th', '', group[j].toString());
          }
        }
      }
    }

    d0.final = function() {
      // column totals
      // todo: this needs to be fixed for 3d tables
      if (options.column_totals && pivot.dimensions.length < 3) {
        let t = body.push('tr');
        t.push('th', {colspan: pivot.dimensions[dim].length}, 'Total');
        pivot.sort(pivot.margins[dim+1].indices['pivot-order'].root,
          (group, key, value) => {
            if (group.length === pivot.dimensions[dim+1].length) {
              if (key === SUBTOTAL) {
                for (let e in options.columns) {
                  let name = options.columns[e];
                  t.push('td', {class: 'st'}, options.formats[name](value.row[name]));
                }
              } else {
                let i = pivot.margins[dim+1].indices['pivot-order'].find(group);
                for (let e in options.columns) {
                  let name = options.columns[e];
                  t.push('td', '', options.formats[name](pivot.margins[dim+1].data[name][i] ));
                }
              }
            }
          }
        );
        // grand total
        if (options.row_totals && options.column_totals && pivot.dimensions.length < 3) {
          for (let j=0; j < options.columns.length; j++) {
            let name = options.columns[j];
            t.push('td', '', options.formats[name](pivot.total[name]));
          }
        }
      } else if (options.column_totals && pivot.dimensions.length === 3) {
        // placeholder for a total row
        let t = body.push('tr');
        prows.push(t);
        t.push('th', {colspan: pivot.dimensions[dim].length}, 'Total');
      }
      div.link(table);
    }

    d0.end = function(group, leaves) {
      if (options.row_totals && group.length == pivot.dimensions[dim].length) {
        let i = pivot.margins[dim].indices['pivot-order'].find(group);
        for (let e in options.columns) {
          let name = options.columns[e];
          row.push('td', '', options.formats[name](pivot.margins[dim].data[name][i]));
        }
      }
    }

    // start the table
    if (this.dimensions.length === 2) {
      this.navigate(d0);
    } else {
      // 3D tables
      let tabs = new Oj.Interface(0);
      tabs.follow = d0;

      //let tab_group = anchor.push('ul', {class: 'tabs group'});
      let tab_group = anchor.push('p', {class: 'tab-group'});
      let container = anchor.push('div', {class: 'container'});

      tabs.begin = function(group, leaves) {
        let id = 'oj-'+uuidv4();
        let selector = '#'+id;
        let a = tab_group.push('a', {class: 'tab deselect'}, group.toString());
        a.e.onclick = function(){
          toggle('.visible', 'visible', 'hidden');
          toggle(selector, 'hidden', 'visible');
          toggle('.select', 'select', 'deselect');
          this.classList.remove('deselect');
          this.classList.add('select');
        }
        div = container.push('div', {class: 'hidden', id: id, style: 'overflow-x: auto'});
        //div.push('h3', {style: 'text-align: center'}, group.toString());
      }

      tabs.final = function() {
        // make the first tab visible
        let c = document.querySelector('.hidden').classList
        c.remove('hidden');
        c.add('visible');
        let a = document.querySelector('.deselect').classList
        a.remove('deselect');
        a.add('select');
        // page totals
        let p=-1;
        pivot.sort(pivot.page_total.indices['pivot-order'].root,
          (group, key, value) => {
            if (group.length === pivot.dimensions[0].length + pivot.dimensions[2].length) {
              if (key === SUBTOTAL) {
                for (let e in options.columns) {
                  let name = options.columns[e];
                  prows[p].push('td', {class: 'st'}, options.formats[name](value.row[name]));
                }
              } else {
                //let i = pivot.margins[dim+1].indices['pivot-order'].find(group);
                for (let e in options.columns) {
                  let name = options.columns[e];
                  prows[p].push('td', '', options.formats[name](pivot.page_total.data[name][value[0]] ));
                }
              }
            }
            if (group.length === pivot.dimensions[0].length) {
              p++;
            }
          }
        );
      }
      this.navigate(tabs);
    }
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

  // toggles class values for any elements matching the selector
  toggle = function(selector, remove, add) {
      let list = document.querySelectorAll(selector);
      list.forEach(e => {
          e.classList.add(add);
          e.classList.remove(remove);
        });
  }

  // https://stackoverflow.com/questions/105034/
  let uuidv4 = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
    });
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
