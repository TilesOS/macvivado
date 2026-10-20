# Derived from Digilent Nexys-A7-100T-Master.xdc. Preserve bank voltage standards.
set_property -dict { PACKAGE_PIN E3 IOSTANDARD LVCMOS33 } [get_ports { CLK100MHZ }];
set_property -dict { PACKAGE_PIN H17 IOSTANDARD LVCMOS33 } [get_ports { LED }];
create_clock -period 10.00 -name sys_clk [get_ports { CLK100MHZ }];
