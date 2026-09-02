# Blade component reference — cached 1 Sep 2026

**Why this file exists.** The Blade MCP server is configured in `.mcp.json`, which is a *Claude Code
local* config. Scheduled cloud routines cannot use it — they only get claude.ai connectors, and none
of ours are connected. So a routine has no way to look Blade props up at runtime.

This is the Blade MCP's own documentation, pulled on 1 Sep 2026 against **`@razorpay/blade@12.121.0`**
(the exact version in `package-lock.json`) and committed verbatim. It was copied, not summarised, so
it is Blade's text rather than anyone's paraphrase of it.

## How to use it

1. **This file first** for the components below.
2. **`.cursor/rules/frontend-blade-rules.mdc`** (committed) for Blade's general conventions.
3. **The shipped type definitions** for anything not covered here — after `npm ci`, every prop is in
   `node_modules/@razorpay/blade/build/**/*.d.ts`. That is version-exact primary source and it is
   what the compiler enforces, so it outranks this file if they ever disagree.
4. If a component is in none of those, **pick a different component that is** rather than guessing a
   prop name. Guessed props are the single largest source of wasted time on this project.

## Setup, already done

`src/app/providers.tsx` wraps the app in `BladeProvider` with `bladeTheme` and `colorScheme="light"`.
`next.config.ts` sets `compiler.styledComponents` and `transpilePackages: ["@razorpay/blade"]`.
`.npmrc` sets `legacy-peer-deps=true`, which Blade requires — its peer list contradicts itself on
every React version (BUILD-LOG 21). Blade components need `"use client"`.

## Known issues, found by using these components (slice 2)

**`Amount` is not used in this project, deliberately.** It logs `window is not defined` during
SSR, and the cause matters more than the symptom: it formats through `@razorpay/i18nify-js`,
whose `getLocale` guards on `typeof navigator === "undefined"` and then reads `window.Intl`.
Node defines a global `navigator` and no `window`, so the guard misses. Making the component
client-only would silence the log but not the real problem — the grouping and decimal separator
then follow the *viewer's* browser locale, so the same audit figure reads as `₹1.196,92` to a
viewer on a de-DE browser. Every rupee figure on the screen is formatted by
`src/lib/format/money.ts` instead: integer paise in, one deterministic string out, Indian digit
grouping, tested.

**A click inside a `Table` row is discarded unless its target is an `svg`, `path`, `div`, `span`
or the `td` itself.** Blade's `Table` sits on `@table-library/react-table-library`, whose
`isRowClick` is that exact allowlist. So `<Code>` (a `<code>`) and a default `<Text>` (a `<p>`)
swallow row clicks silently — no error, no warning. Put `as="span"` on every `Text` inside a row.
`Badge` renders its label as a `<p>` and has no `as` prop, so wrap it in
`<Box pointerEvents="none">` and let the click fall through to the cell. BUILD-LOG entry 28.

**`TableHeaderRow` calls `setHeaderRowDensity` during render**, which React reports as "Cannot
update a component while rendering a different component". It is Blade's own code, unconditional,
and cannot be avoided from the outside. It appears in the dev console and in Next's dev overlay as
one issue; the production console is clean. Not worth working around.

---

Blade components documentation for: Table, Amount, Badge, Card, Box

# Table
## Component Name

Table

## Description

A table component that displays data in a grid format through rows and columns of cells. Table facilitates data organization and allows users to scan, sort, compare, and take action on large amounts of data. It supports features like row selection, pagination, sorting, sticky headers/footers, and customizable cell content.

## Important Constraints

- `Table` `toolbar` prop only accepts `TableToolbar` component

## TypeScript Types

These types define the props that the Table component and its subcomponents accept, helping you understand how to use them properly in your application.

```typescript
// The base identifier type used in tables
type Identifier = string | number;

// Defines the shape of a table node (row)
type TableNode<Item> = Item & {
  id: Identifier;
};

// The main data structure passed to Table
type TableData<Item> = {
  nodes: TableNode<Item>[];
};

// Main Table component props
type TableProps<Item> = {
  /**
   * The children of the Table component should be a function that returns TableHeader, TableBody and TableFooter components.
   * The function will be called with the tableData prop.
   */
  children: (tableData: TableNode<Item>[]) => React.ReactElement;

  /**
   * The data prop is an object with a nodes property that is an array of objects.
   * Each object in the array is a row in the table.
   * The object should have an id property that is a unique identifier for the row.
   */
  data: TableData<Item>;

  /**
   * Selection mode determines how the table rows can be selected.
   * @default 'row'
   **/
  multiSelectTrigger?: 'checkbox' | 'row';

  /**
   * The selectionType prop determines the type of selection that is allowed on the table.
   * @default 'none'
   **/
  selectionType?: 'none' | 'single' | 'multiple';

  /**
   * The onSelectionChange prop is a function that is called when the selection changes.
   **/
  onSelectionChange?: ({
    values,
    selectedIds,
  }: {
    values: TableNode<Item>[];
    selectedIds: Identifier[];
  }) => void;

  /**
   * The isHeaderSticky prop determines whether the table header is sticky or not.
   * @default false
   **/
  isHeaderSticky?: boolean;

  /**
   * The isFooterSticky prop determines whether the table footer is sticky or not.
   * @default false
   **/
  isFooterSticky?: boolean;

  /**
   * The isFirstColumnSticky prop determines whether the first column is sticky or not.
   * @default false
   **/
  isFirstColumnSticky?: boolean;

  /**
   * The rowDensity prop determines the density of the table.
   * @default 'normal'
   **/
  rowDensity?: 'compact' | 'normal' | 'comfortable';

  /**
   * The onSortChange prop is a function that is called when the sort changes.
   **/
  onSortChange?: ({
    sortKey,
    isSortReversed,
  }: {
    sortKey: string | undefined;
    isSortReversed: boolean;
  }) => void;

  /**
   * The sortFunctions prop is an object that has a key for each column that is sortable.
   **/
  sortFunctions?: Record<string, (array: TableNode<Item>[]) => TableNode<Item>[]>;

  /**
   * The toolbar prop is a React element that is rendered above the table.
   **/
  toolbar?: React.ReactElement;

  /**
   * The pagination prop is a React element that is rendered below the table.
   **/
  pagination?: React.ReactElement;

  /**
   * The height prop is a responsive styled prop that determines the height of the table.
   **/
  height?: BoxProps['height'];

  /**
   * The showStripedRows prop determines whether the table should have striped rows or not.
   * @default false
   **/
  showStripedRows?: boolean;

  /**
   * The gridTemplateColumns prop determines the grid-template-columns CSS property of the table.
   * @default `repeat(${columnCount},minmax(100px, 1fr))`
   **/
  gridTemplateColumns?: string;

  /**
   * The isLoading prop determines whether the table is loading or not.
   * @default false
   **/
  isLoading?: boolean;

  /**
   * The isRefreshing prop determines whether the table is refreshing or not.
   * @default false
   **/
  isRefreshing?: boolean;

  /**
   * The showBorderedCells prop determines whether the table should have bordered cells or not.
   **/
  showBorderedCells?: boolean;

  /**
   * An array of default selected row ids. This will be used to set the initial selected rows.
   */
  defaultSelectedIds?: Identifier[];

  /**
   * The backgroundColor prop determines the background color of the table.
   **/
  backgroundColor?: string | 'transparent';
};

// TableHeader component props
type TableHeaderProps = {
  /**
   * The children of TableHeader should be TableHeaderRow
   **/
  children: React.ReactNode;
};

// TableHeaderRow component props
type TableHeaderRowProps = {
  /**
   * The children of TableHeaderRow should be TableHeaderCell
   **/
  children: React.ReactNode;
  /**
   * The rowDensity prop determines the density of the table.
   **/
  rowDensity?: TableProps<unknown>['rowDensity'];
};

// TableHeaderCell component props
type TableHeaderCellProps = {
  /**
   * The children of TableHeaderCell can be a string or a ReactNode.
   **/
  children: string | React.ReactNode;
  /**
   * The unique key of the column.
   * This is used to identify the column for sorting in sortFunctions prop of Table.
   **/
  headerKey?: string;
  /**
   * The textAlign prop determines the content alignment of the table.
   * @default 'left'
   **/
  textAlign?: 'left' | 'center' | 'right';
};

// TableBody component props
type TableBodyProps<Item> = {
  /**
   * The children of the TableBody component should be TableRow components.
   **/
  children: React.ReactNode | ((tableItem: Item, index: number) => React.ReactElement);
};

// TableRow component props
type TableRowProps<Item> = {
  /**
   * The children of the TableRow component should be TableCell components.
   **/
  children: React.ReactNode;
  /**
   * The item prop is used to pass the individual table item to the TableRow component.
   **/
  item: TableNode<Item>;
  /**
   * The isDisabled prop is used to disable the TableRow component.
   **/
  isDisabled?: boolean;
  /**
   * Callback triggered when the row is hovered.
   */
  onHover?: ({ item }: { item: TableNode<Item> }) => void;
  /**
   * Callback triggered when the row is clicked.
   */
  onClick?: ({ item }: { item: TableNode<Item> }) => void;
  /**
   * Actions to display when hovering over the row
   */
  hoverActions?: React.ReactElement;
};

// TableCell component props
type TableCellProps = {
  /**
   * The children of the TableCell component should be a string or a ReactNode.
   **/
  children: React.ReactNode;
  /**
   * The textAlign prop determines the content alignment of the table.
   * @default 'left'
   **/
  textAlign?: 'left' | 'center' | 'right';
};

// TableEditableCell component props
type TableEditableCellProps = {
  // Input related props
  validationState?: 'none' | 'error' | 'success';
  placeholder?: string;
  defaultValue?: string;
  name?: string;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  value?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  maxCharacters?: number;
  autoFocus?: boolean;
  errorText?: string;
  successText?: string;
  // Required prop
  accessibilityLabel: string;
};

// TableFooter component props
type TableFooterProps = {
  /**
   * The children of TableFooter should be TableFooterRow
   **/
  children: React.ReactNode;
};

// TableFooterRow component props
type TableFooterRowProps = {
  /**
   * The children of TableFooterRow should be TableFooterCell
   **/
  children: React.ReactNode;
};

// TableFooterCell component props
type TableFooterCellProps = {
  /**
   * The children of TableHeaderCell can be a string or a ReactNode.
   **/
  children: string | React.ReactNode;
  /**
   * The textAlign prop determines the content alignment of the table.
   * @default 'left'
   **/
  textAlign?: 'left' | 'center' | 'right';
};

// TableToolbar component props
type TableToolbarProps = {
  /**
   * The children of TableToolbar should be TableToolbarActions
   */
  children?: React.ReactNode;
  /**
   * The title of the TableToolbar.
   * @default `Showing 1 to ${totalItems} Items`
   */
  title?: string;
  /**
   * The title to show when items are selected.
   * @default `${selectedRows.length} 'Items'} Selected`
   */
  selectedTitle?: string;
  /**
   * Controls how the TableToolbar is positioned relative to the TableHeader.
   * - `inline`: Renders the toolbar above the TableHeader as part of the normal layout (default).
   * - `overlay`: Renders the toolbar over the TableHeader.
   *
   * Defaults to `inline`.
   */
  placement?: 'inline' | 'overlay';
};

// TablePagination component props
type TablePaginationProps = {
  /**
   * The default page size.
   * @default 10
   **/
  defaultPageSize?: 10 | 25 | 50;

  /**
   * The current page. Passing this prop will make the component controlled.
   **/
  currentPage?: number;

  /**
   * Callback function that is called when the page size is changed
   */
  onPageSizeChange?: ({ pageSize }: { pageSize: number }) => void;

  /**
   * Whether to show the page size picker.
   * @default true
   */
  showPageSizePicker?: boolean;

  /**
   * Whether to show the page number selector.
   * @default false
   */
  showPageNumberSelector?: boolean;

  /**
   * Content of the label to be shown in the pagination component
   */
  label?: string;

  /**
   * Whether to show the label.
   * @default false
   */
  showLabel?: boolean;

  /**
   * Whether the pagination is happening on client or server.
   * @default 'client'
   */
  paginationType?: 'client' | 'server';

  /**
   * The total number of possible items in the table.
   * Required when paginationType is 'server'.
   */
  totalItemCount?: number;

  /**
   * Callback function that is called when the page is changed.
   * Required when paginationType is 'server'.
   */
  onPageChange?: ({ page }: { page: number }) => void;
};
```

## Example

### Comprehensive Table with Advanced Features

This example demonstrates a fully-featured payment transactions table with multiple interactive elements including selection, sorting, sticky headers, row actions, editable cells, custom toolbar, pagination, and footer summaries.

```tsx
import React, { useState } from 'react';
import {
  Table,
  TableHeader,
  TableHeaderRow,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TableEditableCell,
  TableFooter,
  TableFooterRow,
  TableFooterCell,
  TableToolbar,
  TableToolbarActions,
  TablePagination,
  TableData,
  TableNode,
  Box,
  Text,
  Code,
  Button,
  IconButton,
  Badge,
  Amount,
  CheckIcon,
  CloseIcon,
  PlusIcon,
} from '@razorpay/blade/components';

// Define your data types
type PaymentItem = {
  id: string;
  paymentId: string;
  amount: number;
  status: 'Completed' | 'Pending' | 'Failed';
  date: Date;
  type: 'Payout' | 'Refund';
  method: string;
  bank: string;
  account: string;
  name: string;
};

const PaymentTable = () => {
  // Sample data
  const payments: PaymentItem[] = Array.from({ length: 50 }, (_, i) => ({
    id: (i + 1).toString(),
    paymentId: `rzp${Math.floor(Math.random() * 1000000)}`,
    amount: Number((Math.random() * 10000).toFixed(2)),
    status: ['Completed', 'Pending', 'Failed'][Math.floor(Math.random() * 3)] as
      | 'Completed'
      | 'Pending'
      | 'Failed',
    date: new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
    type: ['Payout', 'Refund'][Math.floor(Math.random() * 2)] as 'Payout' | 'Refund',
    method: ['Bank Transfer', 'Credit Card', 'PayPal'][Math.floor(Math.random() * 3)],
    bank: ['HDFC', 'ICICI', 'SBI'][Math.floor(Math.random() * 3)],
    account: Math.floor(Math.random() * 1000000000).toString(),
    name: ['John Doe', 'Jane Smith', 'Bob Johnson'][Math.floor(Math.random() * 3)],
  }));

  const tableData: TableData<PaymentItem> = {
    nodes: payments,
  };

  // State for selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Handle selection change
  const handleSelectionChange = ({ selectedIds }: { selectedIds: (string | number)[] }) => {
    setSelectedIds(selectedIds as string[]);
    console.log('Selected IDs:', selectedIds);
  };

  // Define sort functions
  const sortFunctions = {
    PAYMENT_ID: (array: TableNode<PaymentItem>[]) =>
      [...array].sort((a, b) => a.paymentId.localeCompare(b.paymentId)),
    AMOUNT: (array: TableNode<PaymentItem>[]) => [...array].sort((a, b) => a.amount - b.amount),
    DATE: (array: TableNode<PaymentItem>[]) =>
      [...array].sort((a, b) => a.date.getTime() - b.date.getTime()),
    STATUS: (array: TableNode<PaymentItem>[]) =>
      [...array].sort((a, b) => a.status.localeCompare(b.status)),
  };

  return (
    <Box padding="spacing.5" overflow="auto" minHeight="400px">
      <Table
        data={tableData}
        defaultSelectedIds={['1', '3']}
        onSelectionChange={handleSelectionChange}
        isFirstColumnSticky
        isHeaderSticky
        selectionType="multiple"
        rowDensity="normal"
        showStripedRows
        showBorderedCells
        sortFunctions={sortFunctions}
        toolbar={
          <TableToolbar
            title="Payment Transactions"
            selectedTitle={`${selectedIds.length} Payments Selected`}
          >
            <TableToolbarActions>
              <Button variant="secondary" marginRight="spacing.2" icon={PlusIcon}>
                Export
              </Button>
              <Button>Process Selected</Button>
            </TableToolbarActions>
          </TableToolbar>
        }
        pagination={
          <TablePagination
            defaultPageSize={10}
            showPageSizePicker
            showPageNumberSelector
            onPageChange={({ page }) => console.log('Page changed:', page)}
            onPageSizeChange={({ pageSize }) => console.log('Page size changed:', pageSize)}
          />
        }
      >
        {(tableData) => (
          <>
            <TableHeader>
              <TableHeaderRow>
                <TableHeaderCell headerKey="PAYMENT_ID">Payment ID</TableHeaderCell>
                <TableHeaderCell headerKey="AMOUNT" textAlign="right">
                  Amount
                </TableHeaderCell>
                <TableHeaderCell>Account</TableHeaderCell>
                <TableHeaderCell headerKey="DATE">Date</TableHeaderCell>
                <TableHeaderCell>Method</TableHeaderCell>
                <TableHeaderCell headerKey="STATUS">Status</TableHeaderCell>
                <TableHeaderCell textAlign="center">Actions</TableHeaderCell>
              </TableHeaderRow>
            </TableHeader>

            <TableBody>
              {tableData.map((tableItem, index) => (
                <TableRow
                  key={index}
                  item={tableItem}
                  onClick={({ item }) => console.log('Row clicked:', item.id)}
                  onHover={({ item }) => console.log('Row hovered:', item.id)}
                  hoverActions={
                    <>
                      <Button variant="tertiary" size="xsmall">
                        View Details
                      </Button>
                      <IconButton
                        icon={CheckIcon}
                        isHighlighted
                        accessibilityLabel="Approve"
                        onClick={() => console.log('Approved', tableItem.paymentId)}
                      />
                      <IconButton
                        icon={CloseIcon}
                        isHighlighted
                        accessibilityLabel="Reject"
                        onClick={() => console.log('Rejected', tableItem.paymentId)}
                      />
                    </>
                  }
                >
                  <TableCell>
                    <Code size="medium">{tableItem.paymentId}</Code>
                  </TableCell>
                  <TableCell textAlign="right">
                    <Amount value={tableItem.amount} />
                  </TableCell>
                  <TableEditableCell
                    accessibilityLabel="Account"
                    placeholder="Enter account number"
                    defaultValue={tableItem.account}
                    successText="Account is valid"
                    onChange={(value) => console.log('Account changed:', value)}
                  />
                  <TableCell>
                    {tableItem.date.toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>{tableItem.method}</TableCell>
                  <TableCell>
                    <Badge
                      size="medium"
                      color={
                        tableItem.status === 'Completed'
                          ? 'positive'
                          : tableItem.status === 'Pending'
                          ? 'notice'
                          : 'negative'
                      }
                    >
                      {tableItem.status}
                    </Badge>
                  </TableCell>
                  <TableCell textAlign="center">
                    <Box display="flex" justifyContent="center" gap="spacing.2">
                      <IconButton
                        icon={CheckIcon}
                        accessibilityLabel="Approve"
                        onClick={() => console.log('Approved', tableItem.id)}
                      />
                      <IconButton
                        icon={CloseIcon}
                        accessibilityLabel="Reject"
                        onClick={() => console.log('Rejected', tableItem.id)}
                      />
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>

            <TableFooter>
              <TableFooterRow>
                <TableFooterCell>Total</TableFooterCell>
                <TableFooterCell textAlign="right">
                  <Amount
                    value={tableData.reduce((sum, item) => sum + item.amount, 0)}
                    weight="semibold"
                  />
                </TableFooterCell>
                <TableFooterCell>-</TableFooterCell>
                <TableFooterCell>-</TableFooterCell>
                <TableFooterCell>-</TableFooterCell>
                <TableFooterCell>-</TableFooterCell>
                <TableFooterCell>-</TableFooterCell>
              </TableFooterRow>
            </TableFooter>
          </>
        )}
      </Table>
    </Box>
  );
};

export default PaymentTable;
```

### Server-Side Pagination Example

This example shows how to implement a table with server-side pagination, where data is fetched from an API based on the current page, with loading states and proper handling of page changes.

```tsx
import React, { useState, useEffect } from 'react';
import {
  Table,
  TableHeader,
  TableHeaderRow,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
  TableData,
  Box,
  Spinner,
} from '@razorpay/blade/components';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const ServerPaginatedTable = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 10;

  // Simulated API fetch
  const fetchUsers = async (page: number) => {
    setLoading(true);

    // Replace with actual API call
    setTimeout(() => {
      // Mock data generation for demonstration
      const newUsers = Array.from({ length: pageSize }, (_, i) => ({
        id: `user-${page * pageSize + i + 1}`,
        name: `User ${page * pageSize + i + 1}`,
        email: `user${page * pageSize + i + 1}@example.com`,
        role: ['Admin', 'User', 'Editor'][Math.floor(Math.random() * 3)],
      }));

      setUsers(newUsers);
      setTotalCount(100); // Total count from API
      setLoading(false);
    }, 500);
  };

  useEffect(() => {
    fetchUsers(currentPage);
  }, [currentPage]);

  const handlePageChange = ({ page }: { page: number }) => {
    setCurrentPage(page);
  };

  const tableData: TableData<User> = {
    nodes: users,
  };

  return (
    <Box padding="spacing.5">
      <Table
        data={tableData}
        isLoading={loading}
        pagination={
          <TablePagination
            paginationType="server"
            totalItemCount={totalCount}
            onPageChange={handlePageChange}
            currentPage={currentPage}
            defaultPageSize={pageSize}
            showPageSizePicker={false}
            showPageNumberSelector
          />
        }
      >
        {(tableData) => (
          <>
            <TableHeader>
              <TableHeaderRow>
                <TableHeaderCell>ID</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
              </TableHeaderRow>
            </TableHeader>

            <TableBody>
              {tableData.map((user, index) => (
                <TableRow key={index} item={user}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </>
        )}
      </Table>
    </Box>
  );
};

export default ServerPaginatedTable;
```

### Table Nesting Pattern

Hierarchical data display with expandable rows and animations. Use for parent-child relationships or detailed information.

```tsx
import React, { useState } from 'react';
import {
  Table,
  TableHeader,
  TableHeaderRow,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Badge,
  Box,
  Text,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@razorpay/blade/components';

type Data = {
  id: string;
  name: string;
  totalAmount: number;
  status: string;
  nestedData: Data[];
};

type TableData = Data[];

const tableData: TableData = [
  {
    id: '1',
    name: 'John Doe',
    totalAmount: 100,
    status: 'Completed',
    nestedData: [],
  },
  {
    id: '2',
    name: 'Jane Smith',
    totalAmount: 200,
    status: 'Pending',
    nestedData: [],
  },
];
const TableNestingExample = () => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <Table data={{ nodes: tableData }}>
      {(tableData) => (
        <>
          <TableHeader>
            <TableHeaderRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Amount</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableHeaderRow>
          </TableHeader>

          <TableBody>
            {tableData.map((item) => (
              <>
                <TableRow key={item.id} item={item}>
                  <TableCell>
                    <Button
                      variant="tertiary"
                      size="xsmall"
                      icon={expandedRows.has(item.id) ? ChevronDownIcon : ChevronRightIcon}
                      onClick={() => toggleRow(item.id)}
                    />
                    {item.name}
                  </TableCell>
                  <TableCell>{item.totalAmount}</TableCell>
                  <TableCell>
                    <Badge color="positive">{item.status}</Badge>
                  </TableCell>
                </TableRow>

                {expandedRows.has(String(item.id)) && (
                  <TableRow key={`${item.id}-expanded`} item={item}>
                    <TableCell gridColumnStart={1} gridColumnEnd={4}>
                      <Box
                        backgroundColor="surface.background.gray.subtle"
                        padding="spacing.4"
                        borderRadius="medium"
                        margin="spacing.2"
                      >
                        {/* Nested content here */}
                        {item.nestedData?.map((child) => (
                          <Box key={child.id} display="flex" justifyContent="space-between">
                            <Text>{child.name}</Text>
                            <Text>{child.totalAmount}</Text>
                          </Box>
                        ))}
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </>
      )}
    </Table>
  );
};

export default TableNestingExample;
```

### Table Spanning Pattern

Row and column spanning for complex layouts with merged cells. Use for grouping related data or creating summary sections. Use grid props on TableCell to span across multiple rows or columns for merged cells.

```jsx
{/* Header spanning */}
<TableHeaderCell gridColumnStart={2} gridColumnEnd={4}>
  Combined Header
</TableHeaderCell>

<TableRow item={item}>
  {/* Span across multiple columns */}
  <TableCell gridColumnStart={1} gridColumnEnd={4}>
    Summary spanning 3 columns
  </TableCell>
</TableRow>

<TableRow item={item}>
  {/* Span across multiple rows */}
  <TableCell gridRowStart={2} gridRowEnd={4}>
    Group spanning 2 rows
  </TableCell>
</TableRow>

{/* Footer spanning */}
<TableFooterCell gridColumnStart={1} gridColumnEnd={3}>
  Total
</TableFooterCell>
```

### Table Grouping Pattern

Hierarchical grouped data with automatic tree structure. Use for categorized data with parent-child relationships.

```jsx
const TableGroupingExample = () => {
  return (
    <Table data={groupedData} isGrouped showBorderedCells>
      {(tableData) => (
        <>
          <TableHeader>
            <TableHeaderRow>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Amount</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableHeaderRow>
          </TableHeader>

          <TableBody>
            {tableData.map((item, index) => (
              <TableRow key={index} item={item}>
                <TableCell
                  gridColumnStart={item.treeXLevel === 0 ? 1 : undefined}
                  gridColumnEnd={item.treeXLevel === 0 ? 4 : undefined}
                >
                  {item.name}
                </TableCell>
                {item.treeXLevel !== 0 && (
                  <>
                    <TableCell>{item.amount}</TableCell>
                    <TableCell>{item.status}</TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </>
      )}
    </Table>
  );
};
```


# Amount
## Component Name

Amount

## Description

The Amount component is used to display currency values with proper formatting. It shows small amounts of color-coded metadata, which are ideal for getting user attention. This component only displays the provided value in the specified currency with the formatting capabilities enabled by @razorpay/i18nify-react, it does not perform any currency conversion.

## Important Constraints

- `size` options are limited based on the `type` prop:
  - `type="body"` supports sizes: `xsmall`, `small`, `medium`, `large`
  - `type="heading"` supports sizes: `small`, `medium`, `large`, `xlarge`, `2xlarge`
  - `type="display"` supports sizes: `small`, `medium`, `large`, `xlarge`

## Typescript Types

The following types represent the props that the Amount component and its subcomponents accept. These types allow you to properly configure the Amount component according to your needs.

```typescript
type AmountSizes = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge' | '2xlarge';

type AmountDisplayProps = {
  type?: 'display';
  size?: Extract<AmountSizes, 'small' | 'medium' | 'large' | 'xlarge'>;
  weight?: 'regular' | 'medium' | 'semibold';
};

type AmountHeadingProps = {
  type?: 'heading';
  size?: Extract<AmountSizes, 'small' | 'medium' | 'large' | 'xlarge' | '2xlarge'>;
  weight?: 'regular' | 'semibold';
};

type AmountBodyProps = {
  type?: 'body';
  size?: Extract<AmountSizes, 'xsmall' | 'small' | 'medium' | 'large'>;
  weight?: 'regular' | 'medium' | 'semibold';
};

type AmountTypeProps = AmountDisplayProps | AmountHeadingProps | AmountBodyProps;

type AmountCommonProps = {
  /**
   * The value to be rendered within the component.
   */
  value: number;
  /**
   * Sets the color of the amount.
   * @default undefined
   */
  color?: string;
  /**
   * Indicates what the suffix of amount should be
   * @default 'decimals'
   */
  suffix?: 'decimals' | 'none' | 'humanize';
  /**
   * Makes the currency indicator(currency symbol/code) and decimal digits small and faded
   * @default true
   */
  isAffixSubtle?: boolean;
  /**
   * Determines the visual representation of the currency, choose between displaying the currency symbol or code.
   * Note: Currency symbol and code is determined by the locale set in user's browser or set via @razorpay/i18nify-react library.
   * @default 'currency-symbol'
   */
  currencyIndicator?: 'currency-symbol' | 'currency-code';
  /**
   * The currency of the amount. Note that this component
   * only displays the provided value in the specified currency, it does not perform any currency conversion.
   * @default 'INR'
   */
  currency?: string;
  /**
   * If true, the amount text will have a line through it.
   * @default false
   */
  isStrikethrough?: boolean;
  /**
   * Test ID for the component
   */
  testID?: string;
  /**
   * Data analytics attributes
   */
  [key: `data-analytics-${string}`]: string;
};

type AmountProps = AmountTypeProps & AmountCommonProps;
```

## Examples

### Display Variations

```tsx
import { Amount } from '@razorpay/blade/components';
import { Box } from '@razorpay/blade/components';
import { Text } from '@razorpay/blade/components';

const AmountVariationsExample = () => {
  return (
    <Box display="flex" flexDirection="column" gap="spacing.6">
      <Box>
        <Text marginBottom="spacing.2">Different types and sizes:</Text>
        <Box display="flex" gap="spacing.4">
          <Amount value={12345.67} type="body" size="small" weight="medium" currency="INR" />
          <Amount value={12345.67} type="heading" size="large" weight="semibold" currency="USD" />
          <Amount value={12345.67} type="display" size="xlarge" weight="regular" currency="EUR" />
        </Box>
      </Box>

      <Box>
        <Text marginBottom="spacing.2">Currency variations:</Text>
        <Box display="flex" gap="spacing.4">
          <Amount value={12345.67} currency="INR" currencyIndicator="currency-symbol" />
          <Amount value={12345.67} currency="USD" currencyIndicator="currency-symbol" />
          <Amount value={12345.67} currency="GBP" currencyIndicator="currency-code" />
        </Box>
      </Box>
    </Box>
  );
};

export default AmountVariationsExample;
```

### Formatting and Styling

```tsx
import { Amount } from '@razorpay/blade/components';
import { Box } from '@razorpay/blade/components';
import { Text } from '@razorpay/blade/components';
import { I18nProvider } from '@razorpay/i18nify-react';

const AmountFormattingExample = () => {
  return (
    <I18nProvider>
      <Box display="flex" flexDirection="column" gap="spacing.6">
        <Box>
          <Text marginBottom="spacing.2">Suffix options:</Text>
          <Box display="flex" gap="spacing.4">
            <Amount value={12345.67} suffix="decimals" testID="amount-decimals" />
            <Amount value={12345.67} suffix="none" testID="amount-no-suffix" />
            <Amount value={1234567} suffix="humanize" testID="amount-humanize" />
          </Box>
        </Box>

        <Box>
          <Text marginBottom="spacing.2">Styling options:</Text>
          <Box display="flex" gap="spacing.4">
            <Amount
              value={12345.67}
              isStrikethrough={true}
              data-analytics-section="pricing"
              data-analytics-action="view"
            />
            <Amount value={12345.67} isAffixSubtle={false} />
            <Amount value={12345.67} color="feedback.text.positive.intense" isAffixSubtle={true} />
          </Box>
        </Box>

        <Box>
          <Text marginBottom="spacing.2">Color variations:</Text>
          <Box display="flex" gap="spacing.4">
            <Amount value={12345.67} color="feedback.text.positive.intense" />
            <Amount value={12345.67} color="feedback.text.negative.intense" />
            <Amount value={12345.67} color="feedback.text.notice.intense" />
            <Amount value={12345.67} color="feedback.text.information.intense" />
          </Box>
        </Box>
      </Box>
    </I18nProvider>
  );
};

export default AmountFormattingExample;
```


# Badge
## Component Name

Badge

## Description

Badges are small, color-coded UI elements used to display concise metadata, designed to draw user attention to important information. They offer visual categorization through different colors, sizes, and emphasis levels, making them ideal for status indicators, counts, or category labels.

## Important Constraints

- `children` prop is required and must contain text content
- `icon` prop only accepts `IconComponent`

## TypeScript Types

The following types represent the props that the Badge component accepts. These types allow you to properly configure the component according to your needs.

```typescript
// Main Badge component props
type BadgeProps = {
  /**
   * Sets the label for the badge.
   */
  children: StringChildrenType;

  /**
   * Sets the color of the badge.
   * @default 'neutral'
   */
  color?: FeedbackColors | 'primary';

  /**
   * Sets the contrast of the badge.
   * @default 'subtle'
   */
  emphasis?: SubtleOrIntense;

  /**
   * Sets the size of the badge.
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * Icon to be displayed in the badge.
   * Accepts a component of type `IconComponent` from Blade.
   */
  icon?: IconComponent;

  /**
   * Test ID that can be used to select element in testing environments
   */
  testID?: string;
} & StyledPropsBlade &
  DataAnalyticsAttribute;
```

## Examples

### Badge Usage

This example demonstrates badges with key properties and styling.

```tsx
import React from 'react';
import { Badge, Box, InfoIcon, CheckCircleIcon } from '@razorpay/blade/components';

const BadgeExample = () => {
  return (
    <Box display="flex" gap="spacing.4">
      <Badge color="primary" emphasis="subtle" icon={InfoIcon} size="small">
        Info
      </Badge>

      <Badge
        color="positive"
        emphasis="intense"
        icon={CheckCircleIcon}
        size="medium"
        data-analytics-section="status"
        testID="success-badge"
      >
        Success
      </Badge>

      <Badge
        color="notice"
        emphasis="subtle"
        icon={InfoIcon}
        size="large"
        marginLeft="spacing.2"
        display="inline-flex"
      >
        Warning
      </Badge>
    </Box>
  );
};

export default BadgeExample;
```


# Card
## Component Name

Card

## Description

Cards are containers that group related content and actions on a single topic. They help separate content into distinct sections, making interfaces easier to scan and understand. Cards support various layouts with customizable headers, bodies, and footers, enabling consistent presentation of information while providing clear interaction points for users.

## Important Constraints

- `Card` component only accepts `CardHeader`, `CardBody`, `CardFooter` components as children
- `CardHeader` component only accepts `CardHeaderLeading`, `CardHeaderTrailing` components as children
- `CardFooter` component only accepts `CardFooterLeading`, `CardFooterTrailing` components as children

Make sure to only follow structure as given in the examples below. Fragments are also not allowed as children in these components.

## TypeScript Types

The following types define the props that the Card component and its subcomponents accept:

```typescript
export type CardProps = {
  /**
   * Card contents
   */
  children: React.ReactNode;
  /**
   * Sets the background color of the Card
   *
   * @default `surface.background.gray.intense`
   */
  backgroundColor?:
    | 'surface.background.gray.intense'
    | 'surface.background.gray.moderate'
    | 'surface.background.gray.subtle';
  /**
   * Sets the border radius of the Card
   *
   * @default `medium`
   */
  borderRadius?: Extract<BoxProps['borderRadius'], 'medium' | 'large' | 'xlarge'>;
  /**
   * Sets the elevation for Cards
   *
   * eg: `theme.elevation.midRaised`
   *
   * @default `theme.elevation.lowRaised`
   */
  elevation?: keyof Elevation;
  /**
   * Sets the padding equally on all sides. Only few `spacing` tokens are allowed deliberately
   * @default `spacing.7`
   */
  padding?: 'spacing.0' | 'spacing.3' | 'spacing.4' | 'spacing.5' | 'spacing.7';
  /**
   * Sets the width of the card
   */
  width?: BoxProps['width'];
  /**
   * Sets the height of the card
   */
  height?: BoxProps['height'];
  /**
   * Sets minimum height of the card
   */
  minHeight?: BoxProps['minHeight'];
  /**
   * Sets minimum width of the card
   */
  minWidth?: BoxProps['minWidth'];
  /**
   * Sets maximum width of the card
   */
  maxWidth?: BoxProps['maxWidth'];
  /**
   * If `true`, the card will be in selected state
   * Card will have a primary color border around it.
   *
   * @default false
   */
  isSelected?: boolean;
  /**
   * Makes the Card linkable by setting the `href` prop
   *
   * @default undefined
   */
  href?: string;
  /**
   * Sets the `target` attribute for the linkable card
   */
  target?: string;
  /**
   * Sets the `rel` attribute for the linkable card
   */
  rel?: string;
  /**
   * Sets the accessibility label for the card
   * This is useful when the card has an `href` or `onClick` prop
   * Setting this will announce the label when the card is focused
   */
  accessibilityLabel?: string;
  /**
   * If `true`, the card will scale up on hover
   *
   * On mobile devices it will scale down on press
   *
   * @default false
   */
  shouldScaleOnHover?: boolean;
  /**
   * Callback triggered when the card is hovered
   */
  onHover?: () => void;
  /**
   * Callback triggered when the card is clicked
   */
  onClick?: (
    event: Platform.Select<{
      web: React.MouseEvent;
      native: GestureResponderEvent;
    }>,
  ) => void;
  /**
   * Sets the HTML element for the Card
   *
   * When `as` is set to `label`, the card will be rendered as a label element
   * This can be used to create a custom checkbox or radio button using the card
   *
   * @default undefined
   */
  as?: 'label';
} & TestID &
  DataAnalyticsAttribute &
  StyledPropsBlade;

type CardBodyProps = {
  children: React.ReactNode;
  height?: BoxProps['height'];
} & TestID &
  DataAnalyticsAttribute;

type CardHeaderProps = {
  children?: React.ReactNode;
  /**
   * For spacing between divider and header title
   */
  paddingBottom?: CardSpacingValueType;
  /**
   * For spacing between body content and divider
   */
  marginBottom?: CardSpacingValueType;
  /**
   * @default true
   */
  showDivider?: boolean;
} & TestID &
  DataAnalyticsAttribute;

type CardHeaderLeadingProps = {
  title: string;
  subtitle?: string;
  /**
   * prefix element of Card
   *
   * Accepts: `CardHeaderIcon` component
   */
  prefix?: React.ReactNode;
  /**
   * suffix element of Card
   *
   * Accepts: `CardHeaderCounter` component
   */
  suffix?: React.ReactNode;
} & DataAnalyticsAttribute;

type CardHeaderTrailingProps = {
  /**
   * Renders a visual ornament in card header trailing section
   *
   * Accepts: `CardHeaderLink`, `CardHeaderText`, `CardHeaderIconButton`, `CardHeaderBadge`
   */
  visual?: React.ReactNode;
};

export type CardFooterAction = Pick<
  ButtonProps,
  'type' | 'accessibilityLabel' | 'isLoading' | 'isDisabled' | 'icon' | 'iconPosition' | 'onClick'
> & {
  text: ButtonProps['children'];
};

type CardFooterProps = {
  children?: React.ReactNode;
  /**
   * For spacing between divider and footer title
   */
  paddingTop?: CardSpacingValueType;
  /**
   * For spacing between body content and divider
   */
  marginTop?: CardSpacingValueType;
  /**
   * @default true
   */
  showDivider?: boolean;
} & TestID &
  DataAnalyticsAttribute;

type CardFooterLeadingProps = {
  title?: string;
  subtitle?: string;
} & DataAnalyticsAttribute;

type CardFooterTrailingProps = {
  actions?: {
    primary?: CardFooterAction;
    secondary?: CardFooterAction;
  };
} & DataAnalyticsAttribute;
```

## Example

### Basic Card with Header, Body, and Footer

A complete Card with header, body, and footer sections. Shows how to combine all Card components including icons, titles, badges, and actions.

```tsx
import {
  Card,
  CardBody,
  CardFooter,
  CardFooterLeading,
  CardFooterTrailing,
  CardHeader,
  CardHeaderLeading,
  CardHeaderTrailing,
  CardHeaderIcon,
  CardHeaderCounter,
  CardHeaderBadge,
  Text,
  InfoIcon,
} from '@razorpay/blade/components';

const BasicCardExample = () => {
  return (
    <Card>
      <CardHeader>
        <CardHeaderLeading
          title="Card Header"
          subtitle="Subtitle text that explains more"
          prefix={<CardHeaderIcon icon={InfoIcon} />}
          suffix={<CardHeaderCounter value={12} />}
        />
        <CardHeaderTrailing visual={<CardHeaderBadge color="positive">NEW</CardHeaderBadge>} />
      </CardHeader>
      <CardBody>
        <Text>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum efficitur nisl nec
          dapibus volutpat. Sed vitae fringilla justo, in finibus metus. Nulla facilisi. Nunc ac
          luctus nisi, a ultrices purus.
        </Text>
      </CardBody>
      <CardFooter>
        <CardFooterLeading title="Card footer title" subtitle="Subtitle with more information" />
        <CardFooterTrailing
          actions={{
            primary: {
              onClick: () => console.log('Primary action clicked'),
              text: 'Accept',
            },
            secondary: {
              onClick: () => console.log('Secondary action clicked'),
              text: 'Cancel',
            },
          }}
        />
      </CardFooter>
    </Card>
  );
};
```

### Metric Card

A card displaying metrics with dynamic data visualization, hover effects, and responsive layout. Shows how to combine Card with data display components.

```tsx
import {
  Card,
  CardHeader,
  CardHeaderLeading,
  CardHeaderTrailing,
  CardHeaderLink,
  CardHeaderBadge,
  CardBody,
  Box,
  Text,
  Amount,
  ArrowSquareUpIcon,
  ArrowRightIcon,
  useTheme,
} from '@razorpay/blade/components';
import { useBreakpoint } from '@razorpay/blade/utils';

const MetricCard = () => {
  const { theme } = useTheme();
  const { matchedDeviceType } = useBreakpoint(theme);
  const isMobile = matchedDeviceType === 'mobile';

  return (
    <Card
      backgroundColor="surface.background.gray.intense"
      maxWidth="500px"
      minWidth="300px"
      padding="spacing.5"
      size="medium"
    >
      <CardHeader showDivider={false}>
        <CardHeaderLeading
          title={isMobile ? 'TPV' : 'Total Payment Volume'}
          subtitle={
            isMobile ? 'TPV for the current month' : 'Total Payment Volume for the current month'
          }
        />
        <CardHeaderTrailing
          visual={
            isMobile ? (
              <CardHeaderLink href="/" icon={ArrowRightIcon} iconPosition="right">
                Chart settings
              </CardHeaderLink>
            ) : (
              <CardHeaderBadge color="positive">New</CardHeaderBadge>
            )
          }
        />
      </CardHeader>
      <CardBody>
        <Box display="flex" flexDirection={isMobile ? 'row' : 'column'} gap="spacing.5">
          <Box display="flex" flexDirection="column" justifyContent="flex-end">
            <Box display="flex" flexDirection="row" gap="spacing.3" alignItems="center">
              <Amount
                value={1000}
                color="surface.text.gray.normal"
                weight="semibold"
                size="2xlarge"
                type="heading"
              />
              <Box display="flex" flexDirection="row" gap="spacing.1" alignItems="center">
                <ArrowSquareUpIcon color="interactive.icon.positive.normal" />
                <Text color="interactive.text.positive.normal">12</Text>
              </Box>
            </Box>
          </Box>
          {/* Add your chart/graph component here */}
        </Box>
      </CardBody>
    </Card>
  );
};
```

### Interactive Cards

This example demonstrates how to create a group of cards that can be multi-selected using checkboxes, with validation and error states.

/\*
AI Implementation Notes:

1.  Simple interactive card:
    <Card
    shouldScaleOnHover
    isSelected={isSelected}
    onClick={() => setIsSelected(!isSelected)}
    accessibilityLabel="Card Name"

    >   <CardHeader>

        <CardHeaderLeading title="Title" subtitle="Subtitle" prefix={<CardHeaderIcon icon={Icon} />} />

      </CardHeader>
      <CardBody>
        <Text>Content</Text>
      </CardBody>
    </Card>

2.  Radio button version:
    - Use RadioGroup instead of CheckboxGroup
    - Single state: const [selected, setSelected] = useState('')
    - onChange: ({ value }) => setSelected(value)
    - isSelected check: selected === option.value
    - Remove max selection logic
      \*/

```tsx
import {
  Card,
  CardBody,
  CardHeaderLeading,
  CardHeaderIcon,
  Box,
  Text,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
  CheckboxGroup,
  Checkbox,
  RazorpayIcon,
} from '@razorpay/blade/components';
import React from 'react';

type ProductOption = {
  value: string;
  title: string;
  subtitle: string;
  features: string[];
};

const productOptions: ProductOption[] = [
  {
    value: 'payment-gateway',
    title: 'Payment Gateway',
    subtitle: 'Accept online payments',
    features: [
      '100+ payment methods',
      'UPI, Cards, Netbanking, Wallets',
      'Industry-leading success rates',
      'Real-time payment tracking',
    ],
  },
  {
    value: 'payment-links',
    title: 'Payment Links',
    subtitle: 'Share & collect payments',
    features: [
      'No coding required',
      'Share via SMS, email, WhatsApp',
      'Instant payment collection',
      'Custom branding options',
    ],
  },
  {
    value: 'payment-pages',
    title: 'Payment Pages',
    subtitle: 'Create online store',
    features: [
      'Ready-to-use online store',
      'Product catalog management',
      'Inventory tracking',
      'Mobile-optimized checkout',
    ],
  },
];

const ProductCard = ({
  option,
  isSelected,
  children,
}: {
  option: ProductOption;
  isSelected: boolean;
  children: React.ReactNode;
}) => (
  <Card
    as="label"
    isSelected={isSelected}
    marginBottom="spacing.3"
    width={{ s: '100%', m: '400px' }}
    shouldScaleOnHover
    accessibilityLabel={`Select ${option.title}`}
  >
    <CardBody>
      <Box display="flex" flexDirection="row" gap="spacing.3" alignItems="flex-start">
        <CardHeaderLeading
          title={option.title}
          subtitle={option.subtitle}
          prefix={<CardHeaderIcon icon={RazorpayIcon} />}
        />
        {children}
      </Box>
      <Divider marginY="spacing.3" />
      <List variant="unordered">
        {option.features.map((feature, index) => (
          <ListItem key={index}>
            <ListItemText>{feature}</ListItemText>
          </ListItem>
        ))}
      </List>
    </CardBody>
  </Card>
);

const ProductSelection = () => {
  const [selectedProducts, setSelectedProducts] = React.useState<string[]>([]);
  const [isSubmitted, setIsSubmitted] = React.useState(false);

  const hasError = isSubmitted && selectedProducts.length === 0;
  const hasMaxError = selectedProducts.length > 3;
  const validationState = hasError || hasMaxError ? 'error' : 'none';
  const errorText = hasError
    ? 'Please select at least one product'
    : hasMaxError
    ? 'Maximum 3 products allowed'
    : undefined;

  return (
    <Box display="flex" gap="spacing.6" flexDirection="column">
      <Box>
        <Text marginBottom="spacing.4" weight="semibold" size="large">
          Multi-Select Products
        </Text>
        <CheckboxGroup
          value={selectedProducts}
          onChange={({ values }) => setSelectedProducts(values)}
          label="Which products do you want to use?"
          necessityIndicator="required"
          validationState={validationState}
          errorText={errorText}
          helpText="Select 1-3 products to start with"
          orientation="horizontal"
          flexWrap="wrap"
        >
          {productOptions.map((option) => (
            <ProductCard
              key={option.value}
              option={option}
              isSelected={selectedProducts.includes(option.value)}
            >
              <Checkbox value={option.value} />
            </ProductCard>
          ))}
        </CheckboxGroup>

        <Box
          marginTop="spacing.4"
          display="flex"
          justifyContent="space-between"
          alignItems="center"
        >
          <Button onClick={() => setIsSubmitted(true)} variant="primary">
            Continue
          </Button>
          {selectedProducts.length > 0 && (
            <Text color="surface.text.gray.subtle">Selected: {selectedProducts.length}/3</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ProductSelection;
```


# Box
## Component Name

Box

## Description

Box is a versatile layout primitive component that serves as the foundational building block for creating complex layouts in Blade applications. It provides a comprehensive set of styling and layout properties through a consistent prop-based API, supporting responsive design, flexbox layouts, and styled-system patterns. Box allows developers to create consistent layouts without writing custom CSS while maintaining design system constraints.

## Important Constraints

- `backgroundColor` prop only accepts `transparent`, `surface.background.*`, and `overlay.*` tokens

## Design Guidelines

- Prefer `Card` component instead of this for adding card with shadows. Box component should be primarily used for non-visual layouts (e.g. creating containers, grids, positioning items, etc)

## TypeScript Types

The following types represent the props that the Box component accepts. These types allow you to properly configure the component according to your needs.

```typescript
/**
 * Type for responsive values, allowing different values at different breakpoints
 */
type ResponsiveValue<T> =
  | T
  | {
      base?: T;
      xs?: T;
      s?: T;
      m?: T;
      l?: T;
      xl?: T;
    };

/**
 * Props for the Box component
 */
type BoxProps = {
  /**
   * The HTML element to render the Box as
   * @default 'div'
   */
  as?: 'div' | 'section' | 'article' | 'main' | 'header' | 'footer' | 'aside' | 'nav';

  /**
   * ID attribute of the Box
   */
  id?: string;

  /**
   * The children to render inside the Box
   */
  children?: React.ReactNode;

  /**
   * Flex property - defines how the item will grow or shrink
   * @example "1" | "auto" | "initial" | "none"
   */
  flex?: ResponsiveValue<string | number>;

  /**
   * Flex direction property - defines the direction of the flex items
   * @example "row" | "column" | "row-reverse" | "column-reverse"
   */
  flexDirection?: ResponsiveValue<string>;

  /**
   * Flex wrap property - defines whether flex items should wrap
   * @example "nowrap" | "wrap" | "wrap-reverse"
   */
  flexWrap?: ResponsiveValue<string>;

  /**
   * Flex basis property - defines the initial main size of a flex item
   */
  flexBasis?: ResponsiveValue<string | number>;

  /**
   * Flex grow property - defines how much a flex item will grow
   */
  flexGrow?: ResponsiveValue<string | number>;

  /**
   * Flex shrink property - defines how much a flex item will shrink
   */
  flexShrink?: ResponsiveValue<string | number>;

  /**
   * Display property - defines the display type of an element
   * @example "flex" | "block" | "inline" | "inline-block" | "grid" | "none"
   */
  display?: ResponsiveValue<string>;

  /**
   * Align items property - defines how flex items are aligned along the cross axis
   * @example "flex-start" | "flex-end" | "center" | "baseline" | "stretch"
   */
  alignItems?: ResponsiveValue<string>;

  /**
   * Align self property - overrides the align-items property for a specific flex item
   */
  alignSelf?: ResponsiveValue<string>;

  /**
   * Justify content property - defines how flex items are aligned along the main axis
   * @example "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly"
   */
  justifyContent?: ResponsiveValue<string>;

  /**
   * Gap property - defines the gap between flex/grid items
   */
  gap?: ResponsiveValue<SpacingValueType>;

  /**
   * Margin properties
   */
  margin?: ResponsiveValue<SpacingValueType>;
  marginTop?: ResponsiveValue<SpacingValueType>;
  marginRight?: ResponsiveValue<SpacingValueType>;
  marginBottom?: ResponsiveValue<SpacingValueType>;
  marginLeft?: ResponsiveValue<SpacingValueType>;
  marginX?: ResponsiveValue<SpacingValueType>;
  marginY?: ResponsiveValue<SpacingValueType>;

  /**
   * Padding properties
   */
  padding?: ResponsiveValue<SpacingValueType>;
  paddingTop?: ResponsiveValue<SpacingValueType>;
  paddingRight?: ResponsiveValue<SpacingValueType>;
  paddingBottom?: ResponsiveValue<SpacingValueType>;
  paddingLeft?: ResponsiveValue<SpacingValueType>;
  paddingX?: ResponsiveValue<SpacingValueType>;
  paddingY?: ResponsiveValue<SpacingValueType>;

  /**
   * Width property
   * @example "100%" | "200px" | "auto" | "fit-content"
   */
  width?: ResponsiveValue<string | number>;

  /**
   * Height property
   * @example "100%" | "200px" | "auto" | "fit-content"
   */
  height?: ResponsiveValue<string | number>;

  /**
   * Min-width property
   */
  minWidth?: ResponsiveValue<string | number>;

  /**
   * Min-height property
   */
  minHeight?: ResponsiveValue<string | number>;

  /**
   * Max-width property
   */
  maxWidth?: ResponsiveValue<string | number>;

  /**
   * Max-height property
   */
  maxHeight?: ResponsiveValue<string | number>;

  /**
   * Background color property
   * Uses theme color tokens
   * @example "surface.background.gray.intense"
   */
  backgroundColor?: ResponsiveValue<string>;

  /**
   * Border properties
   */
  border?: ResponsiveValue<string>;
  borderTop?: ResponsiveValue<string>;
  borderRight?: ResponsiveValue<string>;
  borderBottom?: ResponsiveValue<string>;
  borderLeft?: ResponsiveValue<string>;
  borderColor?: ResponsiveValue<string>;
  borderRadius?: ResponsiveValue<string>;
  borderStyle?: ResponsiveValue<string>;
  borderWidth?: ResponsiveValue<string>;

  /**
   * Position property
   * @example "static" | "relative" | "absolute" | "fixed" | "sticky"
   */
  position?: ResponsiveValue<string>;

  /**
   * Top, right, bottom, left properties for positioning
   */
  top?: ResponsiveValue<string | number>;
  right?: ResponsiveValue<string | number>;
  bottom?: ResponsiveValue<string | number>;
  left?: ResponsiveValue<string | number>;

  /**
   * Z-index property
   */
  zIndex?: ResponsiveValue<number | string>;

  /**
   * Overflow properties
   */
  overflow?: ResponsiveValue<string>;
  overflowX?: ResponsiveValue<string>;
  overflowY?: ResponsiveValue<string>;

  /**
   * Elevation - applies box-shadow based on theme elevation tokens
   * @example "lowRaised" | "midRaised" | "highRaised"
   */
  elevation?: 'lowRaised' | 'midRaised' | 'highRaised';

  /**
   * Transform property
   */
  transform?: string;

  /**
   * Transform origin property
   */
  transformOrigin?: string;

  /**
   * Clip path property
   */
  clipPath?: string;

  /**
   * Event handlers
   */
  onMouseOver?: React.MouseEventHandler;
  onMouseEnter?: React.MouseEventHandler;
  onMouseLeave?: React.MouseEventHandler;
  onScroll?: React.UIEventHandler;
  onDragStart?: React.DragEventHandler;
  onDragEnd?: React.DragEventHandler;
  onDragEnter?: React.DragEventHandler;
  onDragOver?: React.DragEventHandler;
  onDragLeave?: React.DragEventHandler;
  onDrop?: React.DragEventHandler;
} & TestID &
  DataAnalyticsAttribute;

/**
 * Type for Box ref
 */
type BoxRefType = HTMLElement;
```

## Example

Here are comprehensive examples demonstrating the versatility of the Box component:

### Responsive Layout with Flexbox and Styling

This example demonstrates a responsive layout with flexbox properties, styling, and elevation.

```tsx
import React from 'react';
import { Box, Text, Heading, Button, RazorpayIcon } from '@razorpay/blade/components';

const ResponsiveLayout = () => {
  return (
    <Box
      // Responsive container with padding that changes at different breakpoints
      padding={{ base: 'spacing.3', m: 'spacing.5' }}
      backgroundColor="surface.background.gray.intense"
      borderRadius="large"
      width="100%"
      maxWidth="800px"
      margin={{ base: 'spacing.0', m: 'auto' }}
    >
      <Heading size="large" marginBottom="spacing.5">
        Responsive Layout
      </Heading>

      {/* Responsive grid */}
      <Box
        display="flex"
        flexDirection={{ base: 'column', m: 'row' }}
        flexWrap="wrap"
        gap="spacing.4"
      >
        <Box
          flex={{ base: 1, m: 1 }}
          flexBasis={{ base: '100%', m: '45%' }}
          backgroundColor="surface.background.gray.intense"
          borderRadius="medium"
          padding="spacing.4"
          elevation="lowRaised"
          overflow="hidden"
          position="relative"
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            marginBottom="spacing.3"
          >
            <Heading size="small">Basic Plan</Heading>
            <Box
              backgroundColor="surface.background.primary.subtle"
              padding="spacing.2"
              borderRadius="round"
            >
              <RazorpayIcon size="medium" />
            </Box>
          </Box>

          <Text marginBottom="spacing.3">
            Perfect for individuals and small teams getting started with our platform.
          </Text>

          <Box marginY="spacing.3">
            <Box display="flex" justifyContent="space-between" marginBottom="spacing.2">
              <Text>Storage</Text>
              <Text>10GB</Text>
            </Box>
            <Box display="flex" justifyContent="space-between" marginBottom="spacing.2">
              <Text>Users</Text>
              <Text>Up to 5</Text>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Text>Support</Text>
              <Text>Email</Text>
            </Box>
          </Box>

          <Box marginTop="spacing.4">
            <Button variant="secondary" isFullWidth>
              Choose Plan
            </Button>
          </Box>
        </Box>

        <Box
          flex={{ base: 1, m: 1 }}
          flexBasis={{ base: '100%', m: '45%' }}
          backgroundColor="surface.background.primary.intense"
          borderRadius="medium"
          padding="spacing.4"
          elevation="midRaised"
          overflow="hidden"
          position="relative"
        >
          <Box
            position="absolute"
            top="spacing.2"
            right="spacing.2"
            backgroundColor="surface.background.primary.subtle"
            borderRadius="medium"
            padding="spacing.2"
          >
            <Text size="small" color="interactive.text.primary.normal">
              Popular
            </Text>
          </Box>

          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            marginBottom="spacing.3"
          >
            <Text weight="semibold">Pro Plan</Text>
            <Box
              backgroundColor="surface.background.gray.intense"
              padding="spacing.2"
              borderRadius="round"
            >
              <RazorpayIcon size="medium" color="surface.icon.staticWhite.normal" />
            </Box>
          </Box>

          <Text marginBottom="spacing.3">
            Enhanced features for growing businesses and professional teams.
          </Text>

          <Box marginY="spacing.3">
            <Box display="flex" justifyContent="space-between" marginBottom="spacing.2">
              <Text>Storage</Text>
              <Text>100GB</Text>
            </Box>
            <Box display="flex" justifyContent="space-between" marginBottom="spacing.2">
              <Text>Users</Text>
              <Text>Up to 20</Text>
            </Box>
            <Box display="flex" justifyContent="space-between">
              <Text>Support</Text>
              <Text>Priority</Text>
            </Box>
          </Box>

          <Box marginTop="spacing.4">
            <Button variant="primary" isFullWidth>
              Choose Plan
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default ResponsiveLayout;
```

### Advanced Positioning and Transformations

This example demonstrates how to use Box with advanced positioning techniques, transformations, and custom styling.

```tsx
import React from 'react';
import { Box, Text, Button } from '@razorpay/blade/components';

const AdvancedPositioningExample = () => {
  return (
    <Box
      // Container for the example
      position="relative"
      height="400px"
      width="100%"
      backgroundColor="surface.background.gray.intense"
      borderRadius="large"
      overflow="hidden"
      padding="spacing.5"
    >
      {/* Background decorative elements */}
      <Box
        position="absolute"
        top="-50px"
        right="-50px"
        width="200px"
        height="200px"
        borderRadius="round"
        backgroundColor="surface.background.primary.subtle"
        clipPath="circle(50% at 50% 50%)"
      />

      <Box
        position="absolute"
        bottom="-30px"
        left="20%"
        width="150px"
        height="150px"
        borderRadius="round"
        backgroundColor="surface.background.cloud.subtle"
        transform="rotate(45deg)"
      />

      {/* Content container */}
      <Box
        position="relative"
        zIndex={1} // Ensures content is above background elements
        display="flex"
        flexDirection="column"
        height="100%"
      >
        <Text variant="body" size="large" marginBottom="spacing.5">
          Advanced positioning example
        </Text>

        {/* Box with transformation */}
        <Box
          backgroundColor="surface.background.gray.subtle"
          borderRadius="medium"
          padding="spacing.4"
          elevation="midRaised"
          marginBottom="spacing.5"
          transform="rotate(-2deg)"
          transformOrigin="center"
        >
          <Text>This box has a slight rotation applied to create visual interest.</Text>
        </Box>

        {/* Overlapping elements */}
        <Box position="relative" height="100px" marginBottom="spacing.4">
          <Box
            position="absolute"
            left="spacing.0"
            top="spacing.0"
            width="80px"
            height="80px"
            backgroundColor="surface.background.primary.intense"
            borderRadius="medium"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={1}
          >
            <Text>Box 1</Text>
          </Box>

          <Box
            position="absolute"
            left="40px"
            top="20px"
            width="80px"
            height="80px"
            backgroundColor="surface.background.cloud.intense"
            borderRadius="medium"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={2}
          >
            <Text color="surface.text.onCloud.onIntense">Box 2</Text>
          </Box>

          <Box
            position="absolute"
            left="80px"
            top="40px"
            width="80px"
            height="80px"
            backgroundColor="surface.background.gray.intense"
            borderRadius="medium"
            display="flex"
            alignItems="center"
            justifyContent="center"
            zIndex={3}
          >
            <Text>Box 3</Text>
          </Box>
        </Box>

        {/* Custom shape using clipPath */}
        <Box
          height="80px"
          backgroundColor="surface.background.primary.subtle"
          padding="spacing.4"
          clipPath="polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%)"
          display="flex"
          alignItems="center"
        >
          <Text>Custom shape using clipPath</Text>
        </Box>
      </Box>
    </Box>
  );
};

export default AdvancedPositioningExample;
```

### Responsive Grid Layout with Event Handling

This example demonstrates a responsive grid layout with event handlers.

```tsx
import React, { useState } from 'react';
import { Box, Text, Heading } from '@razorpay/blade/components';

const ResponsiveGridExample = () => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);

  const handleDrop = (e: React.DragEvent, destinationIndex: number) => {
    e.preventDefault();
    if (draggedItem !== null) {
      console.log(`Moved item from index ${draggedItem} to ${destinationIndex}`);
    }
    setDraggedItem(null);
  };

  const gridItems: Array<{
    title: string;
    color:
      | 'surface.background.primary.intense'
      | 'surface.background.cloud.intense'
      | 'surface.background.primary.subtle'
      | 'surface.background.gray.intense'
      | 'surface.background.gray.moderate'
      | 'surface.background.cloud.subtle';
  }> = [
    { title: 'Analytics', color: 'surface.background.primary.intense' },
    { title: 'Customers', color: 'surface.background.cloud.intense' },
    { title: 'Payments', color: 'surface.background.primary.subtle' },
    { title: 'Products', color: 'surface.background.gray.intense' },
    { title: 'Settings', color: 'surface.background.gray.moderate' },
    { title: 'Reports', color: 'surface.background.cloud.subtle' },
  ];

  return (
    <Box
      // Container
      padding="spacing.5"
      backgroundColor="surface.background.gray.intense"
      borderRadius="large"
    >
      <Heading size="large" marginBottom="spacing.5">
        Responsive Grid Layout
      </Heading>

      <Text marginBottom="spacing.4">
        This grid adapts to screen size and supports hover effects and drag-and-drop.
      </Text>

      {/* Grid container */}
      <Box display="flex" flexWrap="wrap" gap="spacing.4">
        {gridItems.map((item, index) => (
          <Box
            key={index}
            // Responsive sizing
            flex={1}
            flexBasis={{ base: '100%', s: 'calc(50% - 8px)', m: 'calc(33.333% - 16px)' }}
            backgroundColor={item.color}
            borderRadius="medium"
            padding="spacing.4"
            // Elevation changes on hover
            elevation={hoveredIndex === index ? 'highRaised' : 'lowRaised'}
            // Transform on hover
            transform={hoveredIndex === index ? 'translateY(-4px)' : 'none'}
            // Drag and drop handlers
            draggable
            onDragStart={(e) => {
              setDraggedItem(index);
              e.dataTransfer.setData('text/plain', index.toString());
            }}
            onDragEnd={() => setDraggedItem(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, index)}
            // Mouse event handlers
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <Text
              color={
                item.color.includes('primary.intense') || item.color.includes('gray.intense')
                  ? 'surface.text.staticWhite.normal'
                  : 'surface.text.gray.normal'
              }
              weight="semibold"
            >
              {item.title}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default ResponsiveGridExample;
```

---

Blade components documentation for: Heading, Text, Tag, Alert, Spinner, EmptyState, Button, Link, Divider, Indicator, Skeleton, Tooltip, Collapsible, Accordion, Counter, ProgressBar

# Heading
## Component Name

Heading

## Description

The Heading component is designed for creating section headings in a page's hierarchy. It automatically maps different sizes to appropriate HTML heading tags (h1-h6) while maintaining consistent styling. The component supports various sizes, weights, and customization options, making it ideal for creating clear visual hierarchies in your content structure. It's built with accessibility in mind, automatically applying the correct semantic heading tags based on the size prop.

## TypeScript Types

The following types define the props that the Heading component accepts. These types help you understand what properties you can pass to customize the Heading component's appearance and behavior.

```typescript
type HeadingProps = {
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  /**
   * Overrides the color of the Heading component.
   *
   * **Note** This takes priority over `type` and `contrast` prop to decide color of heading
   */
  color?: string;
  weight?: 'regular' | 'semibold';
  children: React.ReactNode;
  textAlign?: string;
  textDecorationLine?: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge' | '2xlarge';
} & TestID &
  StyledPropsBlade;
```

## Example

Here's a comprehensive example showcasing the Heading component's various features and props, demonstrating different sizes, colors, weights, and semantic variations to create page hierarchy:

```tsx
import { Heading, Box, Text } from '@razorpay/blade/components';

function HeadingExample() {
  return (
    <Box display="flex" flexDirection="column" gap="spacing.6">
      {/* Main page heading with largest size */}
      <Heading size="2xlarge" color="surface.text.primary.normal" textAlign="center">
        Welcome to Our Platform
      </Heading>

      {/* Section heading with custom color and weight */}
      <Heading size="xlarge" weight="regular" color="surface.text.primary.normal">
        Features Overview
      </Heading>

      {/* Subsection heading with mixed styles */}
      <Heading size="large">
        Discover our{' '}
        <Heading as="span" size="large" color="feedback.text.information.intense">
          Premium
        </Heading>{' '}
        Solutions
      </Heading>

      {/* Semantic override with as prop */}
      <Heading as="h2" size="medium" weight="semibold" textAlign="left">
        Getting Started Guide
      </Heading>

      {/* Small heading with decoration */}
      <Heading size="small" textDecorationLine="underline" color="surface.text.gray.normal">
        Important Notes
      </Heading>

      {/* Heading with superscript */}
      <Box display="flex" alignItems="flex-start">
        <Heading size="medium">
          Special Offer
          <Heading as="span" size="small" color="feedback.text.positive.intense">
            *
          </Heading>
        </Heading>
      </Box>
    </Box>
  );
}

export default HeadingExample;
```


# Text
## Component Name

Text

## Description

The Text component is a versatile typography component used to display main content on a page. It is designed to work seamlessly with Title or Heading components to create hierarchical content structures. The component automatically applies responsive styles based on the device it's being rendered on. It supports different variants (body and caption), weights, sizes, and can be customized with various text properties like color, alignment, and truncation.

## Important Constraints

- `variant="caption"` only accepts `size="small"` or `size="medium"`

## TypeScript Types

The following types define the props that the Text component and its variants accept. These types help you understand what properties you can pass to customize the Text component's appearance and behavior.

```typescript
type TextVariant = 'body' | 'caption';

type TextCommonProps = {
  as?: 'p' | 'span' | 'div' | 'abbr' | 'figcaption' | 'cite' | 'q' | 'label';
  truncateAfterLines?: number;
  children: React.ReactNode;
  weight?: 'regular' | 'medium' | 'semibold';
  /**
   * Overrides the color of the Text component.
   *
   * **Note** This takes priority over `type` and `contrast` prop to decide color of text
   */
  color?: string;
  textAlign?: string;
  /**
   * Applies text decoration to the text.
   * - 'none': No decoration
   * - 'underline': Solid underline
   * - 'line-through': Strikethrough
   * - 'dotted': Dotted underline (useful for abbreviations or terms with tooltips)
   */
  textDecorationLine?: 'none' | 'underline' | 'line-through' | 'dotted';
  wordBreak?: string;
} & TestID &
  StyledPropsBlade;

type TextBodyVariant = TextCommonProps & {
  variant?: 'body';
  size?: 'xsmall' | 'small' | 'medium' | 'large';
};

type TextCaptionVariant = TextCommonProps & {
  variant?: 'caption';
  size?: 'small' | 'medium';
};

type TextProps<T> = T extends { variant: infer Variant }
  ? Variant extends 'caption'
    ? TextCaptionVariant
    : Variant extends 'body'
    ? TextBodyVariant
    : T
  : T;
```

## Example

Here's a comprehensive example showcasing the Text component's various features and props, demonstrating different text variants, sizes, weights, and styling options for creating properly formatted content:

```tsx
import { Text } from '@razorpay/blade/components';
import { Box } from '@razorpay/blade/components';

function TextExample() {
  return (
    <Box display="flex" flexDirection="column" gap="spacing.4">
      {/* Body variant with different sizes and weights */}
      <Text
        variant="body"
        size="large"
        weight="semibold"
        color="surface.text.primary.normal"
        textAlign="center"
      >
        This is a large body text with semibold weight
      </Text>

      {/* Caption variant with truncation */}
      <Text variant="caption" size="medium" truncateAfterLines={2} color="surface.text.gray.normal">
        This is a medium caption text that will be truncated after 2 lines. Lorem ipsum dolor sit
        amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
        magna aliqua.
      </Text>

      {/* Nested text with different semantic elements */}
      <Text as="p">
        Regular paragraph with
        <Text as="span" weight="semibold" color="surface.text.primary.normal">
          emphasized text
        </Text> and <Text as="cite" variant="body" size="small" textDecorationLine="underline">
          citation
        </Text>
      </Text>

      {/* Accessibility example with label */}
      <Text as="label" variant="body" size="medium" weight="medium" testID="form-label">
        Form Input Label
      </Text>

      {/* Text with word break and custom styling */}
      <Text
        variant="body"
        size="medium"
        wordBreak="break-word"
        textAlign="left"
        color="surface.text.gray.normal"
        margin="spacing.2"
      >
        This text demonstrates word-break and custom styling with margin
      </Text>

      {/* Dotted underline - useful for abbreviations or terms with tooltips */}
      <Text variant="body" size="medium">
        Hover over{' '}
        <Text as="abbr" textDecorationLine="dotted" color="surface.text.primary.normal">
          GST
        </Text>{' '}
        for more information about Goods and Services Tax
      </Text>
    </Box>
  );
}

export default TextExample;
```


# Tag
## Component Name

Tag

## Description

The Tag component displays interactive keywords that help organize and categorize objects. Tags can be added or removed from an object by users. They appear as small, dismissible pill-shaped elements with optional icons and are commonly used to represent selected items in interfaces.

## TypeScript Types

These types represent the props that the Tag component accepts.

```typescript
// Main Tag component props
type TagProps = {
  /**
   * Decides the size of Tag
   *
   * @default medium
   */
  size?: 'medium' | 'large';

  /**
   * Leading icon for your Tag
   */
  icon?: IconComponent;

  /**
   * Callback when close icon on Tag is clicked
   */
  onDismiss: () => void;

  /**
   * Text that renders inside Tag
   */
  children: StringChildrenType;

  /**
   * Disable tag
   */
  isDisabled?: boolean;

  /**
   * Private property for Blade.
   *
   * Should not be used by consumers.
   *
   * Used for adding virtual focus on tag.
   *
   * @private
   */
  _isVirtuallyFocused?: boolean;

  /**
   * Private property for Blade.
   *
   * Should not be used by consumers.
   *
   * Is tag placed inside an input
   *
   * @private
   */
  _isTagInsideInput?: boolean;
} & StyledPropsBlade &
  DataAnalyticsAttribute &
  TestID;
```

## Example

### Basic Usage

This example shows the simplest implementation of a Tag component with an icon and dismiss functionality.

```tsx
import React from 'react';
import { Tag, FileTextIcon } from '@razorpay/blade/components';

function BasicTagExample() {
  const [isTagVisible, setIsTagVisible] = React.useState(true);

  return (
    <>
      {isTagVisible ? (
        <Tag
          icon={FileTextIcon}
          onDismiss={() => {
            console.log('Unpaid Tag dismissed');
            setIsTagVisible(false);
          }}
        >
          Unpaid
        </Tag>
      ) : null}
    </>
  );
}
```

### Disabled Tag

This example demonstrates a Tag in its disabled state, where the dismiss functionality is visually indicated as unavailable but still defined in the code.

```tsx
import React from 'react';
import { Tag, FileTextIcon } from '@razorpay/blade/components';

function DisabledTagExample() {
  const [isTagVisible, setIsTagVisible] = React.useState(true);

  return (
    <>
      {isTagVisible ? (
        <Tag
          icon={FileTextIcon}
          isDisabled={true}
          onDismiss={() => {
            console.log('Disabled Tag dismissed');
            setIsTagVisible(false);
          }}
        >
          Disabled Tag
        </Tag>
      ) : null}
    </>
  );
}
```

### Different Size Tags

This example shows both medium and large Tag sizes side by side for comparison, each with their own dismiss handlers.

```tsx
import React from 'react';
import { Tag, Box, FileTextIcon } from '@razorpay/blade/components';

function TagSizesExample() {
  const [mediumTagVisible, setMediumTagVisible] = React.useState(true);
  const [largeTagVisible, setLargeTagVisible] = React.useState(true);

  return (
    <Box display="flex" gap="spacing.4" alignItems="center">
      {mediumTagVisible ? (
        <Tag size="medium" icon={FileTextIcon} onDismiss={() => setMediumTagVisible(false)}>
          Medium Tag
        </Tag>
      ) : null}

      {largeTagVisible ? (
        <Tag size="large" icon={FileTextIcon} onDismiss={() => setLargeTagVisible(false)}>
          Large Tag
        </Tag>
      ) : null}
    </Box>
  );
}
```

### Tag Group with Input

This example demonstrates how to implement a tag input system where users can add new tags through a text input and remove existing tags by clicking their dismiss buttons.

```tsx
import React from 'react';
import { Tag, Box, TextInput, Button, PlusIcon } from '@razorpay/blade/components';

function TagInputExample() {
  const [inputValue, setInputValue] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);

  const addTag = (): void => {
    // Add input value to tags and clear the input value
    if (inputValue) {
      setTags([...tags, inputValue]);
      setInputValue('');
    }
  };

  const removeTag = (tagName: string): void => {
    setTags(tags.filter((tagNameValue) => tagNameValue !== tagName));
  };

  return (
    <Box>
      <Box paddingY="spacing.4">
        {tags.map((tagName) => (
          <Tag key={tagName} marginRight="spacing.2" onDismiss={() => removeTag(tagName)}>
            {tagName}
          </Tag>
        ))}
      </Box>

      <Box>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTag();
          }}
        >
          <TextInput
            label="Tag Label"
            value={inputValue}
            onChange={({ value }) => setInputValue(value ?? '')}
          />
          <Button
            icon={PlusIcon}
            iconPosition="right"
            variant="secondary"
            marginTop="spacing.2"
            type="submit"
          >
            Create Tag
          </Button>
        </form>
      </Box>
    </Box>
  );
}
```

### Comprehensive Example

This advanced example shows a complete tag management system with different tag states, icons, and interactive features including adding new tags, toggling disabled states, and random tag removal.

```tsx
import React from 'react';
import {
  Tag,
  Box,
  Text,
  TextInput,
  Button,
  PlusIcon,
  FileTextIcon,
  TagIcon,
  CalendarIcon,
  BellIcon,
} from '@razorpay/blade/components';

function ComprehensiveTagExample() {
  // State for managing tags
  const [tags, setTags] = React.useState<
    Array<{
      id: string;
      text: string;
      icon?: React.ComponentType<any>;
      isDisabled?: boolean;
    }>
  >([
    { id: '1', text: 'Unpaid', icon: FileTextIcon },
    { id: '2', text: 'Pending', icon: TagIcon },
    { id: '3', text: 'Completed', icon: CalendarIcon },
    { id: '4', text: 'Disabled', icon: BellIcon, isDisabled: true },
  ]);

  // State for adding new tags
  const [inputValue, setInputValue] = React.useState('');

  // Add a new tag
  const addTag = (): void => {
    if (inputValue) {
      setTags([
        ...tags,
        {
          id: String(Date.now()),
          text: inputValue,
        },
      ]);
      setInputValue('');
    }
  };

  // Remove a tag
  const removeTag = (tagId: string): void => {
    setTags(tags.filter((tag) => tag.id !== tagId));
  };

  // Toggle tag disabled state
  const toggleTagDisabled = (tagId: string): void => {
    setTags(tags.map((tag) => (tag.id === tagId ? { ...tag, isDisabled: !tag.isDisabled } : tag)));
  };

  return (
    <Box display="flex" flexDirection="column" gap="spacing.6">
      <Text size="medium" weight="semibold">
        Tag Management Example
      </Text>

      {/* Display all tags */}
      <Box display="flex" flexWrap="wrap" gap="spacing.3" alignItems="center">
        {tags.map((tag) => (
          <Tag
            key={tag.id}
            icon={tag.icon}
            size="medium"
            isDisabled={tag.isDisabled}
            onDismiss={() => removeTag(tag.id)}
          >
            {tag.text}
          </Tag>
        ))}
      </Box>

      {/* Form to add new tags */}
      <Box marginTop="spacing.2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTag();
          }}
        >
          <TextInput
            label="Add New Tag"
            value={inputValue}
            onChange={({ value }) => setInputValue(value ?? '')}
            placeholder="Enter tag name"
          />
          <Button
            icon={PlusIcon}
            iconPosition="right"
            variant="secondary"
            marginTop="spacing.3"
            type="submit"
          >
            Add Tag
          </Button>
        </form>
      </Box>

      {/* Actions for existing tags */}
      {tags.length > 0 && (
        <Box marginTop="spacing.2">
          <Text size="small" marginBottom="spacing.3">
            Actions for selected tag:
          </Text>
          <Box display="flex" gap="spacing.3">
            <Button
              variant="tertiary"
              onClick={() => {
                if (tags.length > 0) {
                  const randomIndex = Math.floor(Math.random() * tags.length);
                  toggleTagDisabled(tags[randomIndex].id);
                }
              }}
            >
              Toggle Random Tag State
            </Button>

            <Button
              variant="tertiary"
              color="negative"
              onClick={() => {
                if (tags.length > 0) {
                  const randomIndex = Math.floor(Math.random() * tags.length);
                  removeTag(tags[randomIndex].id);
                }
              }}
            >
              Remove Random Tag
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
```


# Alert
## Component Name

Alert

## Description

Alerts are messages that communicate information to users about any significant changes or explanations inside the system in a prominent way. They can include titles, descriptions, and actions, and come in different emphasis levels and colors to convey different types of information. Alerts can be dismissible and can span the full width of their container.

## TypeScript Types

The following types represent the props that the Alert component accepts. These types define all the available properties you can use when implementing the Alert component in your application.

```typescript
type PrimaryAction = {
  text: string;
  onClick: () => void;
};

type SecondaryActionButton = {
  text: string;
  onClick: () => void;
};

type SecondaryActionLinkButton = {
  text: string;
  href: string;
  onClick?: () => void;
  target?: string;
  /**
   * When `target` is set to `_blank` this is automatically set to `noopener noreferrer`
   */
  rel?: string;
};

type SecondaryAction = SecondaryActionButton | SecondaryActionLinkButton;

type AlertProps = {
  /**
   * Body content, pass text or JSX. Avoid passing components except `Link` to customize the content.
   */
  description: ReactChild;

  /**
   * A brief heading
   */
  title?: string;

  /**
   * Shows a dismiss button
   *
   * @default true
   */
  isDismissible?: boolean;

  /**
   * A callback when the dismiss button is clicked
   */
  onDismiss?: () => void;

  /**
   * Can be used to render custom icon
   */
  icon?: IconComponent;

  /**
   * Can be set to `intense` for a more prominent look. Not to be confused with a11y emphasis.
   *
   * @default subtle
   */
  emphasis?: SubtleOrIntense;

  /**
   * Makes the Alert span the entire container width, instead of the default max width of `584px`.
   * This also makes the alert borderless, useful for creating full bleed layouts.
   *
   * @default false
   */
  isFullWidth?: boolean;

  /**
   * Sets the color tone
   */
  color?: FeedbackColors;

  /**
   * Renders a primary action button and a secondary action link button
   */
  actions?: {
    /**
     * Renders a button (should **always** be present if `secondary` action is being used)
     */
    primary?: PrimaryAction;
    /**
     * Renders a Link button
     */
    secondary?: SecondaryAction;
  };
} & TestID &
  StyledPropsBlade &
  DataAnalyticsAttribute;
```

## Examples

### Standard Alert with Title, Description, and Actions

This example demonstrates a standard information alert with title, description, and both primary and secondary actions.

```tsx
import { Alert } from '@razorpay/blade/components';

function StandardAlertExample() {
  return (
    <Alert
      title="International Payments Only"
      description="Currently you can only accept payments in international currencies using PayPal. You cannot accept payments in INR (₹) using PayPal."
      color="information"
      emphasis="subtle"
      isDismissible={true}
      onDismiss={() => console.log('Alert dismissed')}
      actions={{
        primary: {
          text: 'Enable International Payments',
          onClick: () => console.log('Primary action clicked'),
        },
        secondary: {
          text: 'Learn More',
          href: 'https://razorpay.com/docs',
          target: '_blank',
        },
      }}
    />
  );
}
```

### High Emphasis Alerts

High emphasis alerts have a more prominent look with intense styling, useful for drawing more attention.

```tsx
import { Alert } from '@razorpay/blade/components';

function HighEmphasisAlertExample() {
  return (
    <Alert
      title="Unable to fetch merchants"
      description="There was some internal error while fetching the merchants list, this might also be due to the poor internet connection."
      color="negative"
      emphasis="intense"
      isDismissible={true}
      actions={{
        primary: {
          text: 'Try Refetching',
          onClick: () => console.log('Refetch clicked'),
        },
      }}
    />
  );
}
```

### Minimal Alerts

Alerts can be minimal with just a description and no title or actions.

```tsx
import { Alert } from '@razorpay/blade/components';

function MinimalAlertExample() {
  return (
    <Alert
      description="The payment was made 6 months ago, therefore you can't issue refund to this merchant."
      color="notice"
      emphasis="subtle"
      isDismissible={false}
    />
  );
}
```

### Alerts with Single Action

Alerts that provide only a primary action for users to respond.

```tsx
import { Alert } from '@razorpay/blade/components';

function SingleActionAlertExample() {
  return (
    <Alert
      title="Unable to fetch merchants"
      description="There was some internal error while fetching the merchants list, this might also be due to the poor internet connection."
      color="negative"
      emphasis="subtle"
      actions={{
        primary: {
          text: 'Try Refetching',
          onClick: () => console.log('Refetch clicked'),
        },
      }}
    />
  );
}
```

### Full Width Alerts

Full width alerts span the entire width of their container and are useful for full-bleed layouts.

```tsx
import { Alert, Box } from '@razorpay/blade/components';

function FullWidthAlertExample() {
  return (
    <Box position="relative" width="100%">
      <Alert
        title="System Notification"
        description="Currently you can only accept payments in international currencies using PayPal."
        color="information"
        isFullWidth={true}
        actions={{
          primary: {
            text: 'Acknowledge',
            onClick: () => console.log('Acknowledged'),
          },
          secondary: {
            text: 'Read Policy',
            href: 'https://razorpay.com/policy',
            target: '_blank',
          },
        }}
      />
    </Box>
  );
}
```


# Spinner
## Component Name

Spinner

## Description

A Spinner is an element with a looping animation that indicates loading is in progress. It provides visual feedback to users when content is being loaded or when an action is being processed, helping to improve user experience during wait times.

## TypeScript Types

These types define the props that the Spinner component and its subcomponents accept, allowing you to configure the component when using it in your application.

```typescript
// Main component props
type SpinnerProps = {
  /**
   * Sets the color of the spinner.
   *
   * @default 'neutral'
   */
  color?: 'primary' | 'neutral' | 'white';
  /**
   * Sets the label of the spinner.
   */
  label?: string;
  /**
   * Sets the position of the label.
   *
   * @default 'right'
   */
  labelPosition?: 'right' | 'bottom';
  /**
   * Sets the size of the spinner.
   *
   * @default 'medium'
   */
  size?: 'medium' | 'large' | 'xlarge';
  /**
   * Sets the aria-label for web & accessibilityLabel react-native.
   *
   * @default 'Loading'
   */
  accessibilityLabel?: string;
} & TestID &
  StyledPropsBlade;

// Token types
type SpinnerDimensions = {
  medium: 16;
  large: 20;
  xlarge: 24;
};

// Motion configuration
type SpinnerMotion = {
  duration: DurationString;
  easing: EasingString;
};
```

## Example

### Basic Usage

This example demonstrates how to use the Spinner component to indicate a loading state, with a timer that simulates content loading for 3 seconds before displaying a success message.

```tsx
import { useState, useEffect } from 'react';
import { Spinner, Text, Box } from '@razorpay/blade/components';

function LoadingExample() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate a loading state for 3 seconds
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Box>
      {isLoading ? (
        <Spinner accessibilityLabel="Loading content" color="primary" />
      ) : (
        <Text>Content loaded successfully!</Text>
      )}
    </Box>
  );
}
```


# EmptyState
# EmptyState

## Description

EmptyState component provides a consistent way to display empty states across applications with optional visual assets, titles, descriptions, and action elements. It offers different size variants with appropriate spacing and typography scaling, making it suitable for various contexts from small cards to full-page empty states. The component supports custom illustrations, images, icons, and flexible content layouts while maintaining design consistency and accessibility standards.

## TypeScript Types

These are the props that the EmptyState component accepts:

````typescript
export type EmptyStateProps = {
  /**
   * Asset slot for custom illustrations, images, or any visual element.
   * Supports PNGs, custom brand illustrations, SVGs, animated gifs, lottie components etc.
   *
   * @example
   * ```jsx
   * // Custom image
   * <EmptyState asset={<img src="/custom-illustration.png" alt="No data" />} />
   *
   * // Custom component
   * <EmptyState asset={<CustomIllustration />} />
   * ```
   */
  asset?: React.ReactNode;

  /**
   * Primary heading text for the empty state
   */
  title?: string;

  /**
   * Supporting description text providing context and guidance
   */
  description?: string;

  /**
   * Children content for actions, links, or any custom content.
   */
  children?: React.ReactNode;

  /**
   * Size variant affecting the overall scale of the component
   * @default medium
   */
  size?: EmptyStateSize;
} & TestID &
  StyledPropsBlade &
  DataAnalyticsAttribute;

export type EmptyStateSize = 'small' | 'medium' | 'large' | 'xlarge';
````

## Examples

### Complete EmptyState with Interactive Functionality

```tsx
import { useState } from 'react';
import { EmptyState } from '@razorpay/blade/components';
import { Button } from '@razorpay/blade/components';
import { Link } from '@razorpay/blade/components';
import { Box } from '@razorpay/blade/components';

const ErrorEmptyState = () => {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      window.location.reload();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <EmptyState
      size="medium"
      asset={
        <img
          src="/network-error-illustration.png"
          alt="Failed to load data"
          width="90"
          height="90"
        />
      }
      title="Failed to load dashboard data"
      description="We couldn't retrieve your transaction data due to a network issue. Please check your connection and try again, or contact support if the problem persists."
      testID="dashboard-error-empty-state"
      data-analytics-section="dashboard"
      data-analytics-action="error-state-view"
    >
      <Box display="flex" flexDirection="column" gap="spacing.4" alignItems="center">
        <Box display="flex" flexDirection="row" gap="spacing.3">
          <Button onClick={handleRetry} isLoading={isRetrying}>
            Try Again
          </Button>
          <Button variant="secondary" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </Box>
        <Link href="/support" size="small">
          Contact Support
        </Link>
      </Box>
    </EmptyState>
  );
};
```

### Simple EmptyState with Blade Icon

```tsx
import { EmptyState } from '@razorpay/blade/components';
import { Button } from '@razorpay/blade/components';
import { EcommerceIcon } from '@razorpay/blade/components';

const SimpleEmptyState = () => {
  return (
    <EmptyState
      size="xlarge"
      asset={<EcommerceIcon size="2xlarge" color="surface.icon.gray.muted" />}
      title="Your cart is empty"
      description="Browse our products and add items you'd like to purchase."
      testID="cart-empty-state"
      data-analytics-section="shopping-cart"
    >
      <Button size="large" onClick={() => console.log('Navigate to products')}>
        Start Shopping
      </Button>
    </EmptyState>
  );
};
```


# Button
## Component Name

Button

## Description

The Button component is a versatile interactive element used for triggering actions within an application. It supports multiple variants, sizes, and colors to accommodate different UI requirements and hierarchies. Buttons can contain text, icons, or both, and feature various states including disabled and loading to provide clear feedback to users during interactions.

## Important Constraints

- `variant="tertiary"` can only be used with `color="primary"` or `color="white"`

## TypeScript Types

The following types represent the props that the Button component accepts. These types allow you to properly configure the button according to your needs.

```typescript
/**
 * Props for the Button component
 */
type ButtonProps = {
  /**
   * The content of the button
   */
  children?: React.ReactNode;

  /**
   * Button variant that defines the visual style
   * @default 'primary'
   */
  variant?: 'primary' | 'secondary' | 'tertiary';

  /**
   * Color theme of the button
   * Note: Not all color and variant combinations are valid
   * @default 'primary'
   */
  color?: 'primary' | 'white' | 'positive' | 'negative';

  /**
   * Icon to display in the button
   * Accepts an icon component from Blade
   */
  icon?: IconComponent;

  /**
   * Position of the icon relative to the button text
   * @default 'left'
   */
  iconPosition?: 'left' | 'right';

  /**
   * Size of the button
   * @default 'medium'
   */
  size?: 'xsmall' | 'small' | 'medium' | 'large';

  /**
   * Whether the button is disabled
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Whether the button is in a loading state
   * @default false
   */
  isLoading?: boolean;

  /**
   * Whether the button should take the full width of its container
   * @default false
   */
  isFullWidth?: boolean;

  /**
   * The accessible label for the button
   * Required for icon-only buttons
   */
  accessibilityLabel?: string;

  /**
   * Function called when the button is clicked
   */
  onClick?: React.MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;

  /**
   * URL that the button should navigate to when clicked
   * When provided, the button renders as an anchor (<a>) element
   */
  href?: string;

  /**
   * Where to open the linked URL
   * Only applicable when href is provided
   */
  target?: '_blank' | '_self' | '_parent' | '_top';

  /**
   * Relationship between the current page and the linked URL
   * Only applicable when href is provided
   */
  rel?: string;

  /**
   * The type of the button element
   * @default 'button'
   */
  type?: 'button' | 'submit' | 'reset';

  /**
   * Ref object for the button element
   */
  ref?: React.RefObject<HTMLButtonElement | HTMLAnchorElement>;
} & StyledPropsBlade &
  TestID &
  DataAnalyticsAttribute;

/**
 * Type for icon components
 */
type IconComponent = React.ComponentType<{
  size?: 'small' | 'medium' | 'large';
  color?: string;
}>;
```

## Example

Here are comprehensive examples demonstrating various ways to use the Button component:

### Basic Button Variants, Sizes, and Colors

This example demonstrates different button variants, sizes, and colors in a payment form.

```tsx
import React, { useState } from 'react';
import {
  Button,
  Box,
  Text,
  Heading,
  CreditCardIcon,
  ArrowRightIcon,
  ShieldIcon,
} from '@razorpay/blade/components';

const PaymentFormExample = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = () => {
    setIsProcessing(true);
    // Simulate payment processing
    setTimeout(() => {
      setIsProcessing(false);
      // Handle success
    }, 2000);
  };

  return (
    <Box
      padding="spacing.5"
      backgroundColor="surface.background.gray.subtle"
      borderRadius="medium"
      maxWidth="500px"
    >
      <Heading size="large" marginBottom="spacing.4">
        Complete Payment
      </Heading>

      <Text marginBottom="spacing.5">
        Please select a payment option and complete your transaction.
      </Text>

      {/* Primary button - Large size with icon on the right */}
      <Button
        variant="primary"
        color="primary"
        size="large"
        icon={CreditCardIcon}
        iconPosition="right"
        isFullWidth
        isLoading={isProcessing}
        onClick={handlePayment}
        marginBottom="spacing.4"
        testID="pay-button"
        data-analytics="payment-button-click"
      >
        Pay Now ₹1,999
      </Button>

      {/* Secondary button - Medium size */}
      <Button
        variant="secondary"
        color="primary"
        size="medium"
        icon={ArrowRightIcon}
        iconPosition="right"
        isFullWidth
        marginBottom="spacing.4"
        onClick={() => console.log('Save for later')}
      >
        Save for Later
      </Button>

      {/* Tertiary button - Small size with left icon */}
      <Button
        variant="tertiary"
        color="primary"
        size="small"
        icon={ShieldIcon}
        iconPosition="left"
        href="https://razorpay.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        marginBottom="spacing.5"
      >
        View Terms & Conditions
      </Button>

      {/* Extra small icon-only button */}
      <Box display="flex" justifyContent="flex-end">
        <Button
          variant="tertiary"
          size="xsmall"
          icon={CreditCardIcon}
          accessibilityLabel="View payment methods"
          onClick={() => console.log('View payment methods')}
        />
      </Box>
    </Box>
  );
};

export default PaymentFormExample;
```

### Interactive Button with State Management

This example demonstrates buttons with dynamic states and interactions.

```tsx
import React, { useState } from 'react';
import { Button, Box, Text, CheckIcon, RefreshIcon } from '@razorpay/blade/components';

const SimpleToggleExample = () => {
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleActivate = () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setIsActive(true);
    }, 1000);
  };

  const handleReset = () => {
    setIsActive(false);
  };

  return (
    <Box
      padding="spacing.5"
      backgroundColor="surface.background.gray.subtle"
      borderRadius="medium"
      maxWidth="400px"
    >
      <Text marginBottom="spacing.4">
        {isActive ? 'Feature is now active!' : 'Activate this feature to continue'}
      </Text>

      <Box display="flex" gap="spacing.3">
        {!isActive ? (
          <Button
            variant="primary"
            icon={CheckIcon}
            iconPosition="right"
            isLoading={isLoading}
            onClick={handleActivate}
          >
            Activate
          </Button>
        ) : (
          <Button variant="secondary" icon={RefreshIcon} iconPosition="left" onClick={handleReset}>
            Reset
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default SimpleToggleExample;
```


# Link
## Component Name

Link

## Description

The Link component is used for navigating between pages or triggering in-page actions. It supports both anchor-style links for navigation and button-style links for actions. Links can be customized with different sizes, colors, and icon positions to match your design requirements, and they can be used standalone or inline within text content.

## Important Constraints

- At least one of `icon` or text content is required to render a link

## TypeScript Types

The following types represent the props that the Link component accepts. These allow you to properly configure the component according to your needs.

```typescript
/**
 * Props for the Link component
 */
type LinkProps = {
  /**
   * Content to be displayed in the link
   */
  children?: React.ReactNode;

  /**
   * URL that the link points to
   */
  href?: string;

  /**
   * Visual style of the link
   * @default 'anchor'
   */
  variant?: 'anchor' | 'button';

  /**
   * URL target attribute
   */
  target?: string;

  /**
   * URL rel attribute
   */
  rel?: string;

  /**
   * Color scheme for the link
   * @default 'primary'
   */
  color?: 'primary' | 'white' | 'neutral' | 'negative' | 'positive';

  /**
   * Size of the link text
   * @default 'medium'
   */
  size?: 'xsmall' | 'small' | 'medium' | 'large';

  /**
   * Icon to display with the link
   */
  icon?: React.ComponentType<IconProps>;

  /**
   * Position of the icon relative to text
   * @default 'left'
   */
  iconPosition?: 'left' | 'right';

  /**
   * Whether the link is disabled
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Function called when the link is clicked
   */
  onClick?: (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
} & StyledPropsBlade &
  TestID;

/**
 * Props for all Icon components
 */
type IconProps = {
  /**
   * The color of the icon
   * @default 'surface.icon.gray.normal'
   */
  color?: string;

  /**
   * The size of the icon
   * @default 'medium'
   */
  size?: 'small' | 'medium' | 'large' | 'xlarge' | '2xlarge';
};
```

## Examples

### Standard Link Usage

```tsx
import React from 'react';
import {
  Box,
  Heading,
  Link,
  InfoIcon,
  DownloadIcon,
  ArrowRightIcon,
} from '@razorpay/blade/components';

const StandardLinkExample = () => {
  return (
    <Box padding="spacing.5">
      <Heading size="medium" marginBottom="spacing.5">
        Link Component
      </Heading>

      <Box display="flex" gap="spacing.4" flexWrap="wrap" alignItems="center">
        <Link
          href="https://razorpay.com"
          target="_blank"
          rel="noopener noreferrer"
          icon={ArrowRightIcon}
          iconPosition="right"
          color="primary"
          size="medium"
          aria-label="Visit Razorpay website"
        >
          Razorpay Website
        </Link>

        <Link href="#" color="negative" size="small" icon={InfoIcon} iconPosition="left">
          Important Notice
        </Link>

        <Link
          href="#"
          icon={DownloadIcon}
          iconPosition="left"
          onClick={() => console.log('Download clicked')}
          size="large"
        >
          Download Report
        </Link>

        <Link
          variant="button"
          isDisabled={true}
          color="neutral"
          onClick={() => console.log('This will not be called')}
        >
          Unavailable Action
        </Link>

        <Link href="#" color="positive">
          Positive Link
        </Link>

        <Box
          backgroundColor="surface.background.cloud.intense"
          padding="spacing.3"
          borderRadius="medium"
        >
          <Link href="#" color="white">
            White Link
          </Link>
        </Box>

        <Link
          variant="button"
          icon={InfoIcon}
          aria-label="Get more information"
          onClick={() => console.log('Info clicked')}
        />

        <Link href="#" variant="anchor" icon={DownloadIcon} aria-label="Download resources" />
      </Box>
    </Box>
  );
};

export default StandardLinkExample;
```

### Inline Link Usage

```tsx
import React from 'react';
import { Box, Text, Heading, Link, ArrowRightIcon } from '@razorpay/blade/components';

const InlineLinkExample = () => {
  return (
    <Box padding="spacing.5">
      <Heading size="medium" marginBottom="spacing.5">
        Inline Link Usage
      </Heading>

      <Box>
        <Text marginBottom="spacing.3">
          Read our{' '}
          <Link href="/terms" color="primary">
            Terms of Service
          </Link>{' '}
          and
          <Link href="/privacy" color="primary" marginLeft="spacing.1">
            Privacy Policy
          </Link> for more information.
        </Text>

        <Text>
          Forgot your password?{' '}
          <Link variant="button" size="small">
            Reset it here
          </Link>
        </Text>

        <Text marginTop="spacing.3">
          For more details, please visit our{' '}
          <Link href="/help" icon={ArrowRightIcon} iconPosition="right">
            Help Center
          </Link>
          or contact our <Link href="/support" size="small" color="primary">
            Support Team
          </Link>.
        </Text>
      </Box>
    </Box>
  );
};

export default InlineLinkExample;
```


# Divider
## Component Name

Divider

## Description

Divider is a visual element used to separate or divide content within a layout. It provides a clear visual distinction between different sections of content, enhancing readability and organization. The component supports both horizontal and vertical orientations, making it versatile for various UI patterns and layout requirements.

## TypeScript Types

The following types represent the props that the Divider component accepts. These allow you to properly configure the component according to your needs.

```typescript
/**
 * Props for the Divider component
 */
type DividerProps = {
  /**
   * Sets the orientation of divider
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';

  /**
   * Sets the style of divider
   * @default 'solid'
   */
  dividerStyle?: 'solid' | 'dashed';

  /**
   * Sets the variant of divider
   * @default 'muted'
   */
  variant?: 'normal' | 'subtle' | 'muted';

  /**
   * Sets the thickness of divider
   * @default 'thin'
   */
  thickness?: 'thinner' | 'thin' | 'thick' | 'thicker';

  /**
   * Sets the height of divider. Divider uses Flex by default, use height only when parent is not flex.
   */
  height?: CSSObject['height'];

  /**
   * Sets the width of divider. Divider uses Flex by default, use width only when parent is not flex.
   */
  width?: CSSObject['width'];
} & StyledPropsBlade &
  TestID;
```

## Examples

### Horizontal Divider

This example shows the default horizontal divider that separates text sections with vertical spacing.

```tsx
import { Divider, Box, Text } from '@razorpay/blade/components';

const HorizontalDividerExample = () => (
  <Box>
    <Text>Section One</Text>
    <Divider marginY="spacing.3" />
    <Text>Section Two</Text>
  </Box>
);
```

### Vertical Divider

This example demonstrates a vertical divider that separates inline content horizontally within a flex container.

```tsx
import { Divider, Box, Text } from '@razorpay/blade/components';

const VerticalDividerExample = () => (
  <Box display="flex" alignItems="center" height="40px">
    <Text>Left</Text>
    <Divider orientation="vertical" marginX="spacing.4" height="100%" />
    <Text>Right</Text>
  </Box>
);
```

### Styled Divider

This example shows how to customize dividers with different colors and thicknesses to create visual hierarchies.

```tsx
import { Divider, Box, Text } from '@razorpay/blade/components';

const StyledDividerExample = () => (
  <Box>
    <Text>Regular divider below</Text>
    <Divider marginY="spacing.2" />

    <Text>Colored divider below</Text>
    <Divider marginY="spacing.2" variant="normal" thickness="thick" />
  </Box>
);
```

### Divider with Different Styles and Variants

This example demonstrates divider styles (solid/dashed), variants (normal/subtle/muted), and thickness options.

```tsx
import { Divider, Box, Text } from '@razorpay/blade/components';

const DividerVariantsExample = () => (
  <Box>
    <Text>Dashed divider</Text>
    <Divider dividerStyle="dashed" marginY="spacing.2" />

    <Text>Subtle variant with thick thickness</Text>
    <Divider variant="subtle" thickness="thick" marginY="spacing.2" />

    <Text>Dashed with normal variant</Text>
    <Divider dividerStyle="dashed" variant="normal" thickness="thicker" marginY="spacing.2" />
  </Box>
);
```


# Indicator
## Component Name

Indicator

## Description

Indicators are visual elements that describe the condition of an entity. They are used to convey semantic meaning, such as statuses and semantical categories. Indicators can appear with or without text labels and in different emphasis levels (subtle or intense). They provide visual feedback to users through color-coded dot indicators and can be combined with other components through absolute positioning.

## TypeScript Types

The following types define the props that the Indicator component accepts. These types should be used when implementing the Indicator component in your application.

```typescript
type IndicatorProps = {
  /**
   * Sets the color tone
   *
   * @default neutral
   */
  color?: FeedbackColors | 'primary';

  /**
   * Sets the emphasis of the indicator
   *
   * If set to intense it will show a background circle
   *
   * @default subtle
   */
  emphasis?: 'subtle' | 'intense';

  /**
   * Size of the indicator
   *
   * @default medium
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * A text label to show alongside the indicator dot
   */
  children?: StringChildrenType;

  /**
   * a11y label for screen readers
   */
  accessibilityLabel?: string;
} & TestID &
  DataAnalyticsAttribute &
  StyledPropsBlade;
```

Where:

- `FeedbackColors` is a union type of possible feedback colors
- `StringChildrenType` represents text content that can be passed as children
- `TestID` provides test identifiers for testing frameworks
- `DataAnalyticsAttribute` adds data attributes for analytics tracking
- `StyledPropsBlade` includes styled-system props for flexible styling

## Example

This example demonstrates different variations of the Indicator component showing positive, negative, and notice states with different emphasis levels and text options.

```tsx
import { Indicator, Box } from '@razorpay/blade/components';

function IndicatorExample() {
  return (
    <Box display="flex" flexDirection="row" gap="spacing.4" alignItems="center">
      {/* Basic usage with text */}
      <Indicator accessibilityLabel="Status positive" color="positive" size="medium">
        Success
      </Indicator>

      {/* Without text */}
      <Indicator accessibilityLabel="Status negative" color="negative" />

      {/* With intense emphasis */}
      <Indicator accessibilityLabel="Status notice" color="notice" emphasis="intense" />
    </Box>
  );
}
```


# Skeleton
## Component Name

Skeleton

## Description

The Skeleton component is a placeholder UI element that displays a pulsing animation while content is loading. It mimics the structure and appearance of the final content to create a smoother perceived loading experience. Skeletons reduce the perception of loading time and provide users with a visual indication of the layout before the actual content appears.

## TypeScript Types

These types define the props that the Skeleton component accepts, allowing you to configure how the loading placeholders appear.

```typescript
type SkeletonProps = {
  /**
   * Sets the width of the skeleton.
   * Can be any valid CSS width value or responsive object.
   */
  width?: string | number | ResponsiveValue<string | number>;

  /**
   * Sets the maximum width of the skeleton.
   * Can be any valid CSS max-width value or responsive object.
   */
  maxWidth?: string | number | ResponsiveValue<string | number>;

  /**
   * Sets the minimum width of the skeleton.
   * Can be any valid CSS min-width value or responsive object.
   */
  minWidth?: string | number | ResponsiveValue<string | number>;

  /**
   * Sets the height of the skeleton.
   * Can be any valid CSS height value or responsive object.
   */
  height?: string | number | ResponsiveValue<string | number>;

  /**
   * Sets the maximum height of the skeleton.
   * Can be any valid CSS max-height value or responsive object.
   */
  maxHeight?: string | number | ResponsiveValue<string | number>;

  /**
   * Sets the minimum height of the skeleton.
   * Can be any valid CSS min-height value or responsive object.
   */
  minHeight?: string | number | ResponsiveValue<string | number>;

  /**
   * Sets the border radius of the skeleton.
   * @default 'medium'
   */
  borderRadius?: BorderRadiusToken;

  /**
   * Unique identifier for testing purposes.
   */
  testID?: string;
} & StyledPropsBlade &
  Partial<FlexboxProps>;
```

## Example

### Basic Usage

This example shows a simple implementation of multiple Skeleton elements with varying widths and heights to create a text-like loading placeholder.

```tsx
import { Skeleton, Box } from '@razorpay/blade/components';

function BasicSkeletonExample() {
  return (
    <Box padding="spacing.4">
      {/* Simple skeleton line */}
      <Skeleton width="100%" height="24px" borderRadius="medium" marginBottom="spacing.4" />

      {/* Shorter skeleton line */}
      <Skeleton width="60%" height="20px" borderRadius="medium" marginBottom="spacing.4" />

      {/* Even shorter skeleton line */}
      <Skeleton width="40%" height="20px" borderRadius="medium" />
    </Box>
  );
}
```

### Card With Loading State

This example demonstrates how to use Skeleton components within a card to create a realistic loading state that mimics the actual content's structure, with a toggle button to switch between loading and loaded states.

```tsx
import { useState, useEffect } from 'react';
import {
  Skeleton,
  Box,
  Card,
  CardHeader,
  CardBody,
  CardHeaderLeading,
  Button,
  Text,
  Divider,
} from '@razorpay/blade/components';

function CardLoadingExample() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate loading data
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Box maxWidth="400px">
      <Button marginBottom="spacing.4" onClick={() => setIsLoading((prev) => !prev)}>
        Toggle Loading State
      </Button>

      <Card>
        {isLoading ? (
          <Box padding="spacing.6">
            {/* Header skeleton */}
            <Box marginBottom="spacing.4">
              <Skeleton width="70%" height="24px" borderRadius="medium" marginBottom="spacing.3" />
              <Skeleton width="40%" height="16px" borderRadius="medium" />
            </Box>

            <Divider marginY="spacing.4" />

            {/* Content skeleton */}
            <Box>
              <Skeleton width="100%" height="16px" borderRadius="medium" marginBottom="spacing.3" />
              <Skeleton width="100%" height="16px" borderRadius="medium" marginBottom="spacing.3" />
              <Skeleton width="60%" height="16px" borderRadius="medium" />
            </Box>
          </Box>
        ) : (
          <>
            <CardHeader>
              <CardHeaderLeading title="Payment Pages" subtitle="Automated Receipts Enabled" />
            </CardHeader>
            <CardBody>
              <Text>
                Razorpay Payment Pages is the easiest way to accept payments with a custom-branded
                online store. Accept international and domestic payments with automated payment
                receipts.
              </Text>
            </CardBody>
          </>
        )}
      </Card>
    </Box>
  );
}
```


# Tooltip
## Component Name

Tooltip

## Description

The Tooltip component provides additional context about elements or their functions. It's triggered by mouse hover on desktop and on tap on mobile devices. Tooltips appear in a small overlay that floats near its target element, offering supplementary information without disrupting the main workflow.

## TypeScript Types

These types represent the props that the Tooltip component and its subcomponents accept.

```typescript
// Main Tooltip component props
type TooltipProps = {
  /**
   * Tooltip title
   */
  title?: string;
  /**
   * Tooltip content
   */
  content: string;
  /**
   * Placement of tooltip
   *
   * @default "top"
   */
  placement?: Exclude<
    UseFloatingOptions['placement'],
    'left-end' | 'left-start' | 'right-end' | 'right-start'
  >;
  children: React.ReactElement;
  onOpenChange?: ({ isOpen }: { isOpen: boolean }) => void;
  /**
   * Sets the z-index of the modal
   * @default 1100
   */
  zIndex?: number;
} & DataAnalyticsAttribute;

// Props for TooltipInteractiveWrapper - used for non-interactive triggers like icons
// Accepts all BaseBox props except 'as'
type TooltipInteractiveWrapperProps = Omit<BaseBoxProps, 'as'>;
```

## Example

### Basic Usage

This example shows the simplest implementation of a Tooltip component providing additional information for a button element.

```tsx
import { Tooltip, Button } from '@razorpay/blade/components';

function BasicTooltipExample() {
  return (
    <Tooltip content="Additional information about this action" placement="bottom">
      <Button>Hover over me</Button>
    </Tooltip>
  );
}
```

### Tooltip with Title

This example demonstrates a Tooltip with both a title and content, including a callback function that triggers when the tooltip opens or closes.

```tsx
import { Tooltip, Button } from '@razorpay/blade/components';

function TooltipWithTitleExample() {
  return (
    <Tooltip
      title="Important Information"
      content="This action will submit your form data"
      placement="top"
      onOpenChange={({ isOpen }) => console.log(`Tooltip is ${isOpen ? 'open' : 'closed'}`)}
    >
      <Button>Submit Form</Button>
    </Tooltip>
  );
}
```

### Using with Non-Interactive Elements

This example shows how to properly implement tooltips on non-interactive elements like icons by using the TooltipInteractiveWrapper to ensure accessibility.

```tsx
import {
  Tooltip,
  TooltipInteractiveWrapper,
  InfoIcon,
  Box,
  Text,
} from '@razorpay/blade/components';

function NonInteractiveTooltipExample() {
  return (
    <Box display="flex" alignItems="center" gap="spacing.2">
      <Text>Transaction Details</Text>
      <Tooltip content="View detailed information about this transaction" placement="bottom-start">
        <TooltipInteractiveWrapper>
          <InfoIcon size="medium" />
        </TooltipInteractiveWrapper>
      </Tooltip>
    </Box>
  );
}
```


# Collapsible
## Component Name

Collapsible

## Description

Collapsible is a component that allows users to toggle the visibility of hidden content within a container. It provides an expandable/collapsible section that helps manage space efficiency in user interfaces. The component suite includes the main Collapsible container along with specialized trigger elements (CollapsibleButton, CollapsibleLink) and a content container (CollapsibleBody).

## Important Constraints

- `Collapsible` component only accepts `CollapsibleBody`, `CollapsibleButton`, and `CollapsibleLink` components as children

## TypeScript Types

The following types represent the props that the Collapsible component and its subcomponents accept. These allow you to properly configure the components according to your needs.

```typescript
/**
 * Props for the main Collapsible component
 */
type CollapsibleProps = {
  /**
   * Children of the Collapsible component should include a trigger element
   * (CollapsibleButton or CollapsibleLink) and a CollapsibleBody
   */
  children: React.ReactNode;

  /**
   * The default expanded state for uncontrolled usage
   * @default false
   */
  defaultIsExpanded?: boolean;

  /**
   * Direction in which the collapsible content expands
   * @default "bottom"
   */
  direction?: 'top' | 'bottom';

  /**
   * Whether the collapsible content is expanded (controlled mode)
   */
  isExpanded?: boolean;

  /**
   * Callback fired when the expanded state changes
   */
  onExpandChange?: (event: { isExpanded: boolean }) => void;
} & StyledPropsBlade &
  TestID;

/**
 * Props for the CollapsibleButton component
 */
type CollapsibleButtonProps = {
  /**
   * Content of the button
   */
  children: React.ReactNode;
} & StyledPropsBlade &
  TestID;

/**
 * Props for the CollapsibleLink component
 */
type CollapsibleLinkProps = {
  /**
   * Content of the link
   */
  children: React.ReactNode;
} & StyledPropsBlade &
  TestID;

/**
 * Props for the CollapsibleBody component
 */
type CollapsibleBodyProps = {
  /**
   * Content to be collapsed/expanded
   */
  children: React.ReactNode;
} & StyledPropsBlade &
  TestID;
```

## Examples

### Basic Usage: Uncontrolled Collapsible with Button Trigger

```tsx
import React from 'react';
import {
  Collapsible,
  CollapsibleButton,
  CollapsibleBody,
  Text,
  Box,
} from '@razorpay/blade/components';

const UncontrolledExample = () => {
  return (
    <Box maxWidth="500px">
      <Collapsible defaultIsExpanded={false}>
        <CollapsibleButton>Show More Information</CollapsibleButton>
        <CollapsibleBody>
          <Box padding="spacing.3">
            <Text>
              This is an uncontrolled Collapsible with a button trigger. The component manages its
              own expanded state internally using defaultIsExpanded.
            </Text>
          </Box>
        </CollapsibleBody>
      </Collapsible>
    </Box>
  );
};

export default UncontrolledExample;
```

### Controlled Collapsible with Read More Pattern

```tsx
import React, { useState } from 'react';
import {
  Collapsible,
  CollapsibleLink,
  CollapsibleBody,
  Text,
  Box,
  Button,
} from '@razorpay/blade/components';

const ControlledReadMoreExample = () => {
  // State for controlled collapsible
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  return (
    <Box maxWidth="500px">
      <Text marginBottom="spacing.3">
        Collapsible components are perfect for implementing the "Read more" pattern. This is useful
        for long text content where you want to show just a preview initially.
      </Text>

      <Collapsible
        isExpanded={detailsExpanded}
        onExpandChange={({ isExpanded }) => setDetailsExpanded(isExpanded)}
      >
        <CollapsibleLink>{detailsExpanded ? 'Read less' : 'Read more'}</CollapsibleLink>
        <CollapsibleBody>
          <Box padding="spacing.3">
            <Text>
              This is a controlled Collapsible with a link trigger. External state management gives
              you complete control over the expanded state. Using CollapsibleLink instead of
              CollapsibleButton gives a more natural link appearance that's appropriate for in-line
              text expansions. This pattern helps keep interfaces clean while still providing access
              to the full content when needed.
            </Text>
          </Box>
        </CollapsibleBody>
      </Collapsible>
    </Box>
  );
};

export default ControlledReadMoreExample;
```

### Direction Control: Top Expansion

```tsx
import React from 'react';
import {
  Collapsible,
  CollapsibleButton,
  CollapsibleBody,
  Text,
  Box,
} from '@razorpay/blade/components';

const TopDirectionExample = () => {
  return (
    <Box
      maxWidth="500px"
      padding="spacing.4"
      borderWidth="thin"
      borderStyle="solid"
      borderColor="surface.border.gray.normal"
    >
      <Text marginBottom="spacing.4">
        The content below will expand upward instead of downward.
      </Text>

      <Collapsible direction="top">
        <CollapsibleButton>Expand Upward</CollapsibleButton>
        <CollapsibleBody>
          <Box padding="spacing.3" marginBottom="spacing.3">
            <Text>
              This content expands upward using direction="top". Useful when you need to prevent
              pushing content below out of view.
            </Text>
          </Box>
        </CollapsibleBody>
      </Collapsible>
    </Box>
  );
};

export default TopDirectionExample;
```


# Accordion
# Accordion

## Component Name

Accordion

## Description

An accordion is used to allow users to toggle between different content sections in a compact vertical stack. It provides an expandable and collapsible interface to show/hide content, improving space utilization and organizing related information in a hierarchical structure.

## Important Constraints

- `AccordionItem` only allows `AccordionItemHeader` as the first component and `AccordionItemBody` as the second component
- `showNumberPrefix` and `icon` props cannot be used together on the same accordion item

## TypeScript Types

Below are the component props types that Accordion and its subcomponents accept. These types define all the possible properties and configurations you can use when implementing Accordion components in your application.

```typescript
type AccordionVariantType = 'filled' | 'transparent';

type AccordionProps = {
  /**
   * Makes the passed item index expanded by default (uncontrolled)
   */
  defaultExpandedIndex?: number;

  /**
   * Expands the passed index (controlled), `-1` implies no expanded items
   */
  expandedIndex?: number;

  /**
   * Callback for change in any item's expanded state,
   * `-1` implies no expanded items
   */
  onExpandChange?: ({ expandedIndex }: { expandedIndex: number }) => void;

  /**
   * Adds numeric index at the beginning of items
   *
   * @default false
   */
  showNumberPrefix?: boolean;

  /**
   * Visual variant of AccordionItem
   *
   * @default transparent
   */
  variant?: AccordionVariantType;

  /**
   * Size of the Accordion
   *
   * @default large
   */
  size?: 'large' | 'medium';

  /**
   * maxWidth prop of Accordion
   *
   */
  maxWidth?: BoxProps['maxWidth'];

  /**
   * Accepts `AccordionItem` child nodes
   */
  children: React.ReactElement | React.ReactElement[];
} & TestID &
  StyledPropsBlade;

type AccordionItemProps = {
  /**
   * Title text content
   *
   * @deprecated Use AccordionItemHeader and AccordionItemBody
   */
  title?: string;

  /**
   * Body text content
   *
   * @deprecated Use AccordionItemHeader and AccordionItemBody
   */
  description?: string;

  /**
   * Renders a Blade icon as title prefix (requires `showNumberPrefix={false}`)
   *
   * @deprecated Use `leading={<StarIcon size="large" />}` on AccordionItemHeader instead
   */
  icon?: IconComponent;

  /**
   * Slot, renders any custom content
   */
  children?: ReactNode | ReactNode[];

  /**
   * Disabled state of the item
   *
   * @default false
   */
  isDisabled?: boolean;
} & TestID &
  DataAnalyticsAttribute;

// AccordionItemHeader props (derived from BaseHeaderProps)
type AccordionItemHeaderProps = Pick<
  BaseHeaderProps,
  'title' | 'subtitle' | 'leading' | 'children' | 'trailing' | 'titleSuffix'
> &
  DataAnalyticsAttribute;

// AccordionItemBody props
type AccordionItemBodyProps = {
  children?: React.ReactNode | StringChildrenType;
} & DataAnalyticsAttribute;
```

## Examples

### Basic Accordion

A simple accordion with default transparent variant and expandable items.

```tsx
import {
  Accordion,
  AccordionItem,
  AccordionItemHeader,
  AccordionItemBody,
} from '@razorpay/blade/components';

const BasicAccordionExample = () => {
  return (
    <Accordion>
      <AccordionItem>
        <AccordionItemHeader title="How can I setup Route?" />
        <AccordionItemBody>
          You can use Razorpay Route from the Dashboard or using APIs to transfer money to
          customers. You may also check our docs for detailed instructions.
        </AccordionItemBody>
      </AccordionItem>
      <AccordionItem>
        <AccordionItemHeader title="How can I setup QR Codes?" />
        <AccordionItemBody>
          Just use Razorpay. You may also check our docs for detailed instructions. Please use the
          search functionality to ask your queries.
        </AccordionItemBody>
      </AccordionItem>
      <AccordionItem>
        <AccordionItemHeader title="How can I setup Subscriptions?" />
        <AccordionItemBody>
          Just use Razorpay. You may also check our docs for detailed instructions. Please use the
          search functionality to ask your queries.
        </AccordionItemBody>
      </AccordionItem>
    </Accordion>
  );
};
```

### Accordion with Visual Variations

This example shows different visual variants of Accordion, including numbered prefixes, size options, and width customization.

```tsx
import {
  Accordion,
  AccordionItem,
  AccordionItemHeader,
  AccordionItemBody,
  Box,
} from '@razorpay/blade/components';

const AccordionVariantsExample = () => {
  return (
    <Box display="flex" flexDirection="column" gap="spacing.6">
      {/* Accordion with numbered prefixes */}
      <Accordion
        showNumberPrefix={true}
        variant="transparent"
        size="large"
        maxWidth={{ base: '100%', s: '480px' }}
      >
        <AccordionItem>
          <AccordionItemHeader title="First item with numbered prefix" />
          <AccordionItemBody>Content for first item</AccordionItemBody>
        </AccordionItem>
        <AccordionItem>
          <AccordionItemHeader title="Second item with numbered prefix" />
          <AccordionItemBody>Content for second item</AccordionItemBody>
        </AccordionItem>
      </Accordion>

      {/* Filled variant with medium size */}
      <Accordion variant="filled" size="medium">
        <AccordionItem>
          <AccordionItemHeader title="Filled variant medium size" />
          <AccordionItemBody>This accordion uses filled variant with medium size</AccordionItemBody>
        </AccordionItem>
        <AccordionItem>
          <AccordionItemHeader title="Another filled variant item" />
          <AccordionItemBody>More content for the filled variant</AccordionItemBody>
        </AccordionItem>
      </Accordion>
    </Box>
  );
};
```

### Accordion with Rich Header Features

This example shows an accordion with various header features including icons, badges, and interactive elements.

```tsx
import {
  Accordion,
  AccordionItem,
  AccordionItemHeader,
  AccordionItemBody,
  Badge,
  Link,
} from '@razorpay/blade/components';
import { RoutesIcon, QRCodeIcon, SubscriptionsIcon } from '@razorpay/blade/components';

const RichHeaderAccordionExample = () => {
  return (
    <Accordion>
      <AccordionItem>
        <AccordionItemHeader
          leading={<RoutesIcon size="large" />}
          title="How can I setup Route?"
          subtitle="Subtitle for route setup"
          titleSuffix={<Badge>New</Badge>}
          trailing={
            <Link
              variant="button"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              Apply
            </Link>
          }
        />
        <AccordionItemBody>
          You can use Razorpay Route from the Dashboard or using APIs to transfer money to
          customers. You may also check our docs for detailed instructions.
        </AccordionItemBody>
      </AccordionItem>
      <AccordionItem>
        <AccordionItemHeader
          leading={<QRCodeIcon size="large" />}
          title="How can I setup QR Codes?"
        />
        <AccordionItemBody>
          Just use Razorpay. You may also check our docs for detailed instructions.
        </AccordionItemBody>
      </AccordionItem>
      <AccordionItem isDisabled={true}>
        <AccordionItemHeader
          leading={<SubscriptionsIcon size="large" color="surface.icon.gray.disabled" />}
          title="How can I setup Subscriptions?"
          subtitle="This item is disabled"
        />
        <AccordionItemBody>This item is disabled and cannot be expanded.</AccordionItemBody>
      </AccordionItem>
    </Accordion>
  );
};
```

### Controlled Accordion

An example of a controlled accordion where expansion state is managed externally.

```tsx
import { useState } from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionItemHeader,
  AccordionItemBody,
  Box,
  Button,
} from '@razorpay/blade/components';
import { AnnouncementIcon, RoutesIcon } from '@razorpay/blade/components';

const ControlledAccordionExample = () => {
  // State for controlled accordion
  const [expandedIndex, setExpandedIndex] = useState(-1);

  return (
    <Box>
      <Box
        display="flex"
        flexDirection="row"
        gap="spacing.4"
        marginBottom="spacing.6"
        flexWrap="wrap"
      >
        <Button onClick={() => setExpandedIndex(0)}>Expand First</Button>
        <Button onClick={() => setExpandedIndex(1)}>Expand Second</Button>
        <Button onClick={() => setExpandedIndex(-1)}>Collapse All</Button>
      </Box>

      <Accordion
        expandedIndex={expandedIndex}
        onExpandChange={({ expandedIndex }) => setExpandedIndex(expandedIndex)}
      >
        <AccordionItem>
          <AccordionItemHeader
            leading={<AnnouncementIcon size="large" />}
            title="Controlled Item 1"
            subtitle="This is controlled by external state"
          />
          <AccordionItemBody>Content for controlled item 1</AccordionItemBody>
        </AccordionItem>
        <AccordionItem>
          <AccordionItemHeader
            leading={<RoutesIcon size="large" />}
            title="Controlled Item 2"
            subtitle="This is also controlled by external state"
          />
          <AccordionItemBody>Content for controlled item 2</AccordionItemBody>
        </AccordionItem>
      </Accordion>
    </Box>
  );
};
```

### Accordion with Custom Content

This example shows how to use custom content in both header and body of accordion items.

```tsx
import {
  Accordion,
  AccordionItem,
  AccordionItemHeader,
  AccordionItemBody,
  Box,
  Text,
  Indicator,
  Alert,
  TextInput,
  Button,
  UserIcon,
} from '@razorpay/blade/components';
import { useState } from 'react';

const CustomContentAccordionExample = () => {
  const [isAlertVisible, setIsAlertVisible] = useState(true);

  return (
    <Accordion maxWidth={{ base: '100%', s: '480px' }}>
      {/* Custom header content */}
      <AccordionItem>
        <AccordionItemHeader>
          <Box>
            <Text size="large" color="surface.text.gray.muted">
              #8218851
            </Text>
            <Text marginY="spacing.2" size="large" weight="semibold">
              Transactions and settlement related
            </Text>
            <Box display="flex" flexDirection="row" gap="spacing.3">
              <Indicator size="medium" color="information">
                In Progress
              </Indicator>
              <Box display="flex" alignItems="center" flexDirection="row" gap="spacing.2">
                <UserIcon size="medium" color="surface.icon.gray.subtle" />
                <Text size="medium" color="surface.text.gray.subtle">
                  Merchant Risk
                </Text>
              </Box>
            </Box>
          </Box>
        </AccordionItemHeader>
        <AccordionItemBody>
          <TextInput label="Additional Information" placeholder="Enter details here" />
          <Button marginTop="spacing.4">Submit</Button>
        </AccordionItemBody>
      </AccordionItem>

      {/* Custom body content with conditional rendering */}
      <AccordionItem>
        <AccordionItemHeader title="Item with interactive body content" />
        <AccordionItemBody>
          <Text color="surface.text.gray.subtle" marginBottom="spacing.4">
            You can use Razorpay services as described in the documentation.
          </Text>

          {isAlertVisible && (
            <Alert
              title="Custom slot"
              description="You can render anything here along with description"
              onDismiss={() => setIsAlertVisible(false)}
            />
          )}
        </AccordionItemBody>
      </AccordionItem>
    </Accordion>
  );
};
```

### Payment Method Selection Example

A real-world example showing how to use Accordion for payment method selection.

```tsx
import {
  Accordion,
  AccordionItem,
  AccordionItemHeader,
  AccordionItemBody,
  Box,
  TextInput,
  Button,
  Badge,
} from '@razorpay/blade/components';

const PaymentMethodsAccordion = () => {
  return (
    <Box maxWidth={{ base: '100%', s: '480px' }}>
      <Accordion variant="filled" defaultExpandedIndex={0}>
        <AccordionItem>
          <AccordionItemHeader title="UPI Payment" subtitle="Pay directly from your bank account" />
          <AccordionItemBody>
            <TextInput label="UPI ID" placeholder="username@upi" />
            <Button marginTop="spacing.4" isFullWidth>
              Pay Now
            </Button>
          </AccordionItemBody>
        </AccordionItem>

        <AccordionItem>
          <AccordionItemHeader
            title="Credit Card"
            subtitle="Secure card payment"
            titleSuffix={<Badge color="positive">No Extra Charge</Badge>}
          />
          <AccordionItemBody>
            <TextInput label="Card Number" placeholder="1234 5678 9012 3456" />
            <Box display="flex" flexDirection="row" gap="spacing.4" marginTop="spacing.4">
              <TextInput label="Expiry" placeholder="MM/YY" />
              <TextInput label="CVV" placeholder="123" />
            </Box>
            <Button marginTop="spacing.4" isFullWidth>
              Pay Now
            </Button>
          </AccordionItemBody>
        </AccordionItem>

        <AccordionItem>
          <AccordionItemHeader
            title="Net Banking"
            subtitle="Pay using your bank account"
            titleSuffix={<Badge color="positive">5% Cashback</Badge>}
          />
          <AccordionItemBody>
            <TextInput label="Select Bank" placeholder="Choose your bank" />
            <Button marginTop="spacing.4" isFullWidth>
              Continue
            </Button>
          </AccordionItemBody>
        </AccordionItem>
      </Accordion>
    </Box>
  );
};
```


# Counter
## Component Name

Counter

## Description

Counter is a visual indicator that displays numerical values, tallies, or counts within a specific context. It provides a compact way to show non-interactive numerical data, with customizable appearance through size, color, and emphasis variations. Counters are useful for displaying notification counts, item quantities, or status indicators throughout an interface.

## TypeScript Types

The following types represent the props that the Counter component accepts. These allow you to properly configure the component according to your needs.

```typescript
/**
 * Props for the Counter component
 */
type CounterProps = {
  /**
   * The numerical value to display
   */
  value: number;

  /**
   * Maximum value to display before showing a "+" suffix
   * If value exceeds max, it will display "{max}+"
   * @example max={99} with value={120} would display "99+"
   */
  max?: number;

  /**
   * Visual color of the counter
   * @default "neutral"
   */
  color?: 'positive' | 'negative' | 'notice' | 'information' | 'neutral' | 'primary';

  /**
   * Visual emphasis/intensity of the counter
   * @default "subtle"
   */
  emphasis?: 'subtle' | 'intense';

  /**
   * Size of the counter
   * @default "medium"
   */
  size?: 'small' | 'medium' | 'large';
} & StyledPropsBlade &
  TestID;
```

## Example

This example demonstrates different variants of the Counter component with various sizes, colors, emphasis levels, and a max value with overflow handling.

```tsx
import React from 'react';
import { Counter, Box, Text } from '@razorpay/blade/components';

const CounterExample = () => {
  return (
    <Box padding="spacing.4">
      <Text marginBottom="spacing.4">Counter Component Examples</Text>

      <Box display="flex" flexWrap="wrap" gap="spacing.4">
        <Counter value={8} size="small" color="primary" />
        <Counter value={24} size="medium" color="positive" />
        <Counter value={42} size="small" color="negative" emphasis="intense" />
        <Counter value={1000} max={99} color="negative" emphasis="subtle" size="large" />
      </Box>
    </Box>
  );
};

export default CounterExample;
```


# ProgressBar
## Component Name

ProgressBar

## Description

A ProgressBar is a visual indicator that displays the progress of a process or task. It can be used to show determinate progress (with a known completion percentage) or indeterminate progress (when the completion time is unknown). The component offers different variants including linear and circular styles, and can be configured as either a progress indicator or a meter depending on the use case.

## Important Constraints

- `isIndeterminate` cannot be set when `type="meter"`
- `isIndeterminate` cannot be set when `variant="circular"`
- `size="large"` is not available when `variant="linear"`
- When `type` prop is set, `variant` can only be `"linear"` or `"circular"` (not `"progress"` or `"meter"`)

## TypeScript Types

These types represent the props that the component accepts. When using the ProgressBar component, you'll need to understand these types to properly configure it.

```typescript
type ProgressBarCommonProps = {
  /**
   * Sets aria-label to help users know what the progress bar is for. Default value is the same as the `label` passed.
   */
  accessibilityLabel?: string;
  /**
   * Sets the color of the progress bar which changes the feedback color.
   */
  color?: FeedbackColors;
  /**
   * Sets the type of the progress bar.
   * @default 'progress'
   */
  type?: 'meter' | 'progress';
  /**
   * Sets the label to be rendered for the progress bar. This value will also be used as default for `accessibilityLabel`.
   */
  label?: string;
  /**
   * Sets the size of the progress bar.
   * Note: 'large' size isn't available when the variant is 'linear'.
   * @default 'small'
   */
  size?: 'small' | 'medium' | 'large';
  /**
   * Sets the progress value of the progress bar.
   */
  value?: number;
  /**
   * Sets the minimum value for the progress bar.
   * @default 0
   */
  min?: number;
  /**
   * Sets the maximum value for the progress bar.
   * @default 100
   */
  max?: number;
} & TestID &
  DataAnalyticsAttribute &
  StyledPropsBlade;

type ProgressBarVariant = 'progress' | 'meter' | 'linear' | 'circular';

type ProgressBarProgressProps = ProgressBarCommonProps & {
  /**
   * Sets the variant to be rendered for the progress bar.
   * @default 'progress'
   */
  variant?: Extract<ProgressBarVariant, 'progress' | 'linear' | 'circular'>;
  /**
   * Sets whether the progress bar is in an indeterminate state.
   * @default false
   */
  isIndeterminate?: boolean;
  /**
   * Sets whether or not to show the progress percentage for the progress bar. Percentage is hidden by default for the `meter` variant.
   * @default true
   */
  showPercentage?: boolean;
};

type ProgressBarMeterProps = ProgressBarCommonProps & {
  /**
   * Sets the variant to be rendered for thr progress bar.
   * @default 'progress'
   */
  variant?: Extract<ProgressBarVariant, 'meter' | 'linear' | 'circular'>;
  /**
   * Sets whether the progress bar is in an indeterminate state.
   * @default false
   */
  isIndeterminate?: undefined;
  /**
   * Sets whether or not to show the progress percentage for the progress bar. Percentage is hidden by default for the `meter` variant.
   * @default false
   */
  showPercentage?: undefined;
};

type ProgressBarProps = ProgressBarProgressProps | ProgressBarMeterProps;
```

## Example

### Basic Usage

```tsx
import { ProgressBar } from '@razorpay/blade/components';
import { Box } from '@razorpay/blade/components';

function BasicProgressBarExample() {
  return (
    <Box display="flex" flexDirection="column" gap="spacing.6">
      {/* Simple progress bar */}
      <ProgressBar label="Loading data" value={60} size="medium" />

      {/* Circular progress bar */}
      <ProgressBar label="Upload progress" value={75} variant="circular" size="medium" />
    </Box>
  );
}
```

### Dynamic Progress

```tsx
import { ProgressBar } from '@razorpay/blade/components';
import { Box } from '@razorpay/blade/components';
import { useState, useEffect } from 'react';

function DynamicProgressExample() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prevProgress) => {
        if (prevProgress >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prevProgress + 5;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box display="flex" flexDirection="column" gap="spacing.6">
      <ProgressBar
        label={`File upload (${progress}%)`}
        value={progress}
        color="positive"
        size="medium"
      />

      <ProgressBar
        label="Circular progress"
        value={progress}
        variant="circular"
        color="information"
        size="large"
      />
    </Box>
  );
}
```